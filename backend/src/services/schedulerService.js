const SchedulerJob = require('../models/SchedulerJob');
const Timetable = require('../models/Timetable');
const { importFacultyTimetables } = require('./importTimetableService');
const path = require('path');
const { spawn } = require('child_process');

let ioInstance = null;
const runningJobs = new Map();

function init(io) {
  ioInstance = io;
}

function emit(jobId, event, payload) {
  if (!ioInstance) {
    console.warn('Socket.IO not initialized, cannot emit event:', event);
    return;
  }
  try {
    ioInstance.to(jobId).emit(event, { jobId, ...payload });
  } catch (error) {
    console.error('Error emitting socket event:', error);
  }
}

async function generateTimetable({ departments, years, sections, timingTemplateIds, mode, seed, options, createdBy }) {
  const job = await SchedulerJob.create({ status: 'queued', logs: [], startedAt: new Date(), options: { departments, years, sections, mode, seed, options }, createdBy });

  const jobId = job._id.toString();

  // Start async simulation
  runJob(jobId, { departments, years, sections, timingTemplateIds, mode, seed, options }).catch(() => {});
  return jobId;
}

async function runJob(jobId, params) {
  runningJobs.set(jobId, { cancelled: false });
  const appendLog = async (msg) => {
    try {
      await SchedulerJob.findByIdAndUpdate(jobId, { $push: { logs: msg }, status: 'running' });
      emit(jobId, 'generation:progress', { message: msg });
    } catch (error) {
      console.error('Error appending log:', error);
    }
  };
  
  try {
    await appendLog('Starting timetable generation...');

    // Run Python scheduler
    const pythonScriptPath = process.env.PYTHON_SCHEDULER_SCRIPT_PATH || path.join(process.cwd(), '../timetable generatorv2/src/main.py');
    const outputPath = process.env.PYTHON_SCHEDULER_OUTPUT_PATH || path.join(process.cwd(), '../timetable generatorv2/TT_Flexinput_output');
    
    const pythonProcess = spawn('python', [
      pythonScriptPath,
      '--output', outputPath
    ]);

    let pythonOutput = '';
    pythonProcess.stdout.on('data', (data) => {
      pythonOutput += data.toString();
      appendLog(data.toString().trim());
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python error: ${data}`);
      appendLog(`Error: ${data.toString().trim()}`);
    });

    await new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });

    if (runningJobs.get(jobId)?.cancelled) throw new Error('Cancelled');

    // Create timetable record
    const now = new Date();
    const tt = await Timetable.create({
      generatedAt: now,
      generatedBy: 'scheduler',
      timingTemplateIds: params.timingTemplateIds || {},
      generatedForYears: params.years,
      status: 'draft',
      department: params.departments[0],
      year: params.years[0],
      sections: []  // Will be populated from CSV
    });

    await appendLog('Importing faculty timetables...');
    
    // Import faculty timetables from generated CSVs
    await importFacultyTimetables(outputPath, tt._id);

    await appendLog('Faculty timetables imported successfully');

    await SchedulerJob.findByIdAndUpdate(jobId, { 
      status: 'completed', 
      finishedAt: new Date(), 
      resultSummary: { timetables: [tt._id] }
    });

    emit(jobId, 'generation:completed', { timetables: [tt._id] });
  } catch (err) {
    const cancelled = err?.message === 'Cancelled';
    await SchedulerJob.findByIdAndUpdate(jobId, { status: cancelled ? 'cancelled' : 'failed', finishedAt: new Date() });
    emit(jobId, 'generation:error', { message: err?.message || 'Error' });
  } finally {
    runningJobs.delete(jobId);
  }
}

async function cancelJob(jobId) {
  const state = runningJobs.get(jobId);
  if (state) state.cancelled = true;
}

async function getStatus(jobId) {
  return SchedulerJob.findById(jobId).lean();
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { init, generateTimetable, cancelJob, getStatus };


