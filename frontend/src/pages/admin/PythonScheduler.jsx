import { useState, useEffect, useCallback } from 'react'

const REQUIRED_FILES = [
  { key: 'day_worksheet.csv', label: 'day_worksheet.csv' },
  { key: 'sections.csv', label: 'sections.csv' },
  { key: 'faculty.csv', label: 'faculty.csv' },
  { key: 'courses.csv', label: 'courses.csv' },
  { key: 'section_course_requirements.csv', label: 'section_course_requirements.csv' },
  { key: 'faculty_courses.csv', label: 'faculty_courses.csv' },
]

const OPTIONAL_FILES = [
  { key: 'rooms.csv', label: 'rooms.csv (optional)' },
]

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result || '').split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function PythonScheduler() {
  const [timeLimit, setTimeLimit] = useState(90)
  const [optimizeGaps, setOptimizeGaps] = useState(false)
  const [files, setFiles] = useState({})
  const [running, setRunning] = useState(false)
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const pollStatus = useCallback(async (id) => {
    if (!id) return
    try {
      const res = await fetch(`/api/admin/python-scheduler/run/${id}/status`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Failed to get status')
      setJobStatus(data)
      if (data.status === 'completed' || data.status === 'failed') {
        setRunning(false)
        if (data.status === 'completed') {
          // The result is now part of the job status, so we can use it directly
          const timetableId = data.resultSummary?.timetables?.[0]
          if (timetableId) {
            const ttRes = await fetch(`/api/admin/timetables/${timetableId}`, { credentials: 'include' })
            const ttData = await ttRes.json()
            setResult({ timetableId, solver: ttData })
          }
        } else if (data.status === 'failed') {
          setError(data.logs?.join('\n') || 'Job failed')
        }
      }
    } catch (e) {
      setError(e.message)
      setRunning(false)
    }
  }, [])

  useEffect(() => {
    if (running && jobId) {
      const interval = setInterval(() => pollStatus(jobId), 3000)
      return () => clearInterval(interval)
    }
  }, [running, jobId, pollStatus])

  function onFileChange(name, file) {
    setFiles(prev => ({ ...prev, [name]: file }))
  }

  async function runScheduler() {
    setError('')
    setResult(null)
    setJobId(null)
    setJobStatus(null)
    const missing = REQUIRED_FILES.filter(f => !files[f.key])
    if (missing.length) {
      setError(`Missing files: ${missing.map(m => m.label).join(', ')}`)
      return
    }
    setRunning(true)
    try {
      const payloadFiles = []
      const all = [...REQUIRED_FILES, ...OPTIONAL_FILES]
      for (const f of all) {
        const file = files[f.key]
        if (!file) continue
        const content = await fileToBase64(file)
        payloadFiles.push({ name: f.key, content })
      }
      const res = await fetch('/api/admin/python-scheduler/run-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ files: payloadFiles, timeLimit, optimizeGaps })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Scheduler failed to start')
      setJobId(data.jobId)
    } catch (e) {
      setError(e.message)
      setRunning(false)
    }
  }

  async function publish() {
    if (!result?.timetableId) { setError('No timetable to publish'); return }
    try {
      const res = await fetch('/api/admin/python-scheduler/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ timetableId: result.timetableId, sectionGrids: result.solver?.sectionGrids || {}, facultyGrids: result.solver?.facultyGrids || {} })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Publish failed')
      setError('')
      alert('Published successfully')
    } catch (e) {
      setError(e.message)
    }
  }

  function SectionResults({ sections }) {
    const entries = Object.entries(sections || {})
    if (!entries.length) return <p>No sections.</p>
    return entries.map(([sectionName, rows]) => (
      <div key={sectionName} className="card" style={{ marginTop: '.75rem' }}>
        <h3>{sectionName}</h3>
        <table width="100%">
          <thead><tr><th>Day</th><th>Period</th><th>Course</th><th>Faculty</th><th>Room</th><th>Type</th></tr></thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{r.dayName}</td>
                <td>{r.periodIndex + 1}</td>
                <td>{r.courseId}</td>
                <td>{r.facultyId}</td>
                <td>{r.roomId}</td>
                <td>{r.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ))
  }

  function FacultyResults({ faculty }) {
    const entries = Object.entries(faculty || {})
    if (!entries.length) return <p>No faculty schedules.</p>
    return entries.map(([facultyId, rows]) => (
      <div key={facultyId} className="card" style={{ marginTop: '.75rem' }}>
        <h3>{facultyId}</h3>
        <table width="100%">
          <thead><tr><th>Day</th><th>Period</th><th>Course</th><th>Section</th><th>Room</th><th>Type</th></tr></thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{r.dayName}</td>
                <td>{r.periodIndex + 1}</td>
                <td>{r.courseId}</td>
                <td>{r.sectionId}</td>
                <td>{r.roomId}</td>
                <td>{r.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ))
  }

  function AvailableResources({ availableRooms, availableFaculty }) {
    // Helper to render room/faculty items that might be strings or objects
    function renderItem(item, idx) {
      if (typeof item === 'string') {
        return item
      }
      if (typeof item === 'object' && item !== null) {
        // Handle object format - extract relevant fields
        return item.roomId || item.name || item.id || JSON.stringify(item)
      }
      return String(item)
    }

    return (
      <div className="grid-2" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h3>Available Rooms</h3>
          {availableRooms && availableRooms.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {availableRooms.map((room, idx) => (
                <li key={idx} style={{ padding: '0.5rem', background: 'rgba(102, 126, 234, 0.05)', marginBottom: '0.5rem', borderRadius: '6px' }}>
                  {renderItem(room, idx)}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#64748b' }}>No available rooms data</p>
          )}
        </div>
        <div className="card">
          <h3>Available Faculty</h3>
          {availableFaculty && availableFaculty.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {availableFaculty.map((faculty, idx) => (
                <li key={idx} style={{ padding: '0.5rem', background: 'rgba(102, 126, 234, 0.05)', marginBottom: '0.5rem', borderRadius: '6px' }}>
                  {renderItem(faculty, idx)}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#64748b' }}>No available faculty data</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <section>
      <h2>Scheduler</h2>
      <div className="scheduler-form grid-2">
        <div className="card">
          <h3>Parameters</h3>
          <div className="field">
            <label>Time limit (sec)</label>
            <input type="number" value={timeLimit} onChange={e=>setTimeLimit(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="checkbox-row">
              <input type="checkbox" checked={optimizeGaps} onChange={e=>setOptimizeGaps(e.target.checked)} />
              <span>Optimize gaps</span>
            </label>
          </div>
        </div>
        <div className="card">
          <h3>Upload CSVs</h3>
          {REQUIRED_FILES.map(f => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <div className="file-row">
                <input type="file" accept=".csv" onChange={e=>onFileChange(f.key, e.target.files?.[0])} />
                <span className="file-name">{files[f.key]?.name || 'No file selected'}</span>
              </div>
            </div>
          ))}
          {OPTIONAL_FILES.map(f => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <div className="file-row">
                <input type="file" accept=".csv" onChange={e=>onFileChange(f.key, e.target.files?.[0])} />
                <span className="file-name">{files[f.key]?.name || 'No file selected'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <button className="btn btn-primary" onClick={runScheduler} disabled={running}>{running ? `Running... (Job ${jobStatus?.status || 'started'})` : 'Run Solver'}</button>
      </div>
      {error && <p className="alert error" style={{ marginTop: '.5rem' }}>{error}</p>}
      {jobStatus && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>Job Status: {jobStatus.status}</h3>
          {jobStatus.logs && jobStatus.logs.length > 0 && (
            <details>
              <summary>Logs</summary>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#f4f4f4', padding: '1rem', borderRadius: '6px' }}>
                {jobStatus.logs.join('\n')}
              </pre>
            </details>
          )}
        </div>
      )}
      {result && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Solver Status: {result.solver?.status || jobStatus?.resultSummary?.status}</h3>
          {result.solver?.warnings?.length ? <p>Warnings: {result.solver.warnings.join(', ')}</p> : null}
          <div className="actions" style={{ margin: '.5rem 0' }}>
            <button className="btn btn-primary" onClick={publish}>Publish</button>
          </div>
          
          <details open>
            <summary style={{ fontSize: '1.2rem', fontWeight: 600, marginTop: '1rem', cursor: 'pointer' }}>Available Resources</summary>
            <AvailableResources 
              availableRooms={result.solver?.availableRooms} 
              availableFaculty={result.solver?.availableFaculty} 
            />
          </details>
          
          <details open>
            <summary style={{ fontSize: '1.2rem', fontWeight: 600, marginTop: '1rem', cursor: 'pointer' }}>Sections</summary>
            <SectionResults sections={result.solver?.sections} />
          </details>
          
          <details>
            <summary style={{ fontSize: '1.2rem', fontWeight: 600, marginTop: '1rem', cursor: 'pointer' }}>Faculty</summary>
            <FacultyResults faculty={result.solver?.faculty} />
          </details>
        </div>
      )}
    </section>
  )
}

