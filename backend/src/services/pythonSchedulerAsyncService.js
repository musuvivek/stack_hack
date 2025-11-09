const SchedulerJob = require('../models/SchedulerJob');
const Timetable = require('../models/Timetable');
const FacultyRoutine = require('../models/FacultyRoutine');
const AvailableRoom = require('../models/AvailableRoom');
const AvailableFaculty = require('../models/AvailableFaculty');
const Faculty = require('../models/Faculty');
const { runSolver } = require('./pythonSchedulerClient');

async function startPythonSchedulerJob(payload, createdBy) {
  const summary = {
    filesCount: Array.isArray(payload.files) ? payload.files.length : 0,
    timeLimit: payload.timeLimit,
    optimizeGaps: Boolean(payload.optimizeGaps),
  };
  const job = await SchedulerJob.create({
    status: 'queued',
    logs: [],
    startedAt: new Date(),
    options: { kind: 'python-scheduler', summary },
    createdBy: createdBy || 'admin',
  });
  const jobId = job._id.toString();
  runAsync(jobId, payload, createdBy).catch(() => {});
  return jobId;
}

async function appendLog(jobId, msg) {
  try {
    await SchedulerJob.findByIdAndUpdate(jobId, { $push: { logs: String(msg) }, status: 'running' });
  } catch (e) {
    // swallow
  }
}

async function runAsync(jobId, payload, createdBy) {
  try {
    await appendLog(jobId, 'Calling Python scheduler /api/solve ...');
    const solver = await runSolver(payload);
    await appendLog(jobId, `Solver returned status: ${solver.status || 'unknown'}`);

    // Build sections for timetable
    const sectionsPayload = Object.entries(solver.sections || {});
    const sectionsForDoc = sectionsPayload.map(([sectionName, entries]) => ({
      sectionName,
      schedule: entries.map((entry) => ({
        day: entry.dayName,
        periodIndex: entry.periodIndex,
        courseId: entry.courseId,
        facultyId: entry.facultyId,
        roomId: entry.roomId,
        kind: entry.kind,
        locked: false,
      })),
    }));

    const tt = await Timetable.create({
      generatedAt: new Date(),
      generatedBy: createdBy || 'admin',
      status: 'draft',
      timingTemplateIds: {},
      generatedForYears: [],
      department: 'python-scheduler',
      sections: sectionsForDoc,
      warnings: solver.warnings || [],
    });
    await appendLog(jobId, `Timetable created: ${tt._id}`);

    // Persist available rooms
    if (Array.isArray(solver.availableRooms) && solver.availableRooms.length) {
      await AvailableRoom.create({
        timetableId: tt._id,
        slots: solver.availableRooms.map((s) => ({
          day: s.dayName,
          dayIndex: s.dayIndex,
          periodIndex: s.periodIndex,
          rooms: s.rooms || [],
        })),
      });
      await appendLog(jobId, `Available rooms stored (${solver.availableRooms.length} slots)`);
    }

    // Persist available faculty
    if (Array.isArray(solver.availableFaculty) && solver.availableFaculty.length) {
      await AvailableFaculty.create({
        timetableId: tt._id,
        slots: solver.availableFaculty.map((s) => ({
          day: s.dayName,
          dayIndex: s.dayIndex,
          periodIndex: s.periodIndex,
          faculty: s.faculty || [],
        })),
      });
      await appendLog(jobId, `Available faculty stored (${solver.availableFaculty.length} slots)`);
    }

    // Persist faculty routines
    const facDocs = [];
    for (const [facKey, rows] of Object.entries(solver.faculty || {})) {
      const fac = await Faculty.findOne({ $or: [{ teacherId: facKey }, { email: facKey }] }).lean();
      facDocs.push({
        facultyId: fac?.id || facKey,
        facultyEmail: fac?.email,
        sourceDataset: 'python-scheduler',
        entries: rows.map((r) => ({ day: r.dayName, periodIndex: r.periodIndex, courseCode: r.courseId, section: r.sectionId, room: r.roomId })),
      });
    }
    if (facDocs.length) {
      await FacultyRoutine.insertMany(facDocs);
      await appendLog(jobId, `Faculty routines stored (${facDocs.length} docs)`);
    }

    await SchedulerJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      finishedAt: new Date(),
      resultSummary: { timetables: [tt._id], warnings: tt.warnings?.length || 0, sectionsCount: sectionsForDoc.length },
    });
    await appendLog(jobId, 'Job completed');
  } catch (e) {
    const msg = e?.message || String(e);
    await appendLog(jobId, `Error: ${msg}`);
    await SchedulerJob.findByIdAndUpdate(jobId, { status: 'failed', finishedAt: new Date() });
  }
}

async function getPythonSchedulerStatus(jobId) {
  const j = await SchedulerJob.findById(jobId).lean();
  if (!j) return null;
  return { status: j.status, logs: j.logs || [], resultSummary: j.resultSummary || {}, startedAt: j.startedAt, finishedAt: j.finishedAt };
}

module.exports = { startPythonSchedulerJob, getPythonSchedulerStatus };