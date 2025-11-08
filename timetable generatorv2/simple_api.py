from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import subprocess
import tempfile
import json
import os
import shutil
from pathlib import Path

app = FastAPI()

class SolveRequest(BaseModel):
    files: List[Dict[str, Any]]
    timeLimit: int = 90
    optimizeGaps: bool = False

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/solve")
async def solve_timetable(request: SolveRequest):
    # Create temporary directories for input and output
    with tempfile.TemporaryDirectory() as temp_dir:
        input_dir = Path(temp_dir) / "input"
        output_dir = Path(temp_dir) / "output"
        input_dir.mkdir()
        output_dir.mkdir()
        
        # Write input files
        for file_data in request.files:
            filename = file_data.get('filename', 'unknown.csv')
            content = file_data.get('content', '')
            file_path = input_dir / filename
            file_path.write_text(content)
        
        # Run the main.py script
        try:
            # Use conda run to ensure we're using the correct environment
            # Set environment to ensure correct imports
            env = os.environ.copy()
            env['PYTHONPATH'] = "d:\\stackhack\\Stack_Hack\\timetable generatorv2"
            
            result = subprocess.run([
                'D:\\Anacondaa\\envs\\timetable\\python.exe', 'run_solver.py',
                '--inputs', str(input_dir),
                '--output', str(output_dir),
                '--time_limit_sec', str(request.timeLimit),
                *(['--optimize_gaps'] if request.optimizeGaps else [])
            ], 
            capture_output=True, 
            text=True, 
            timeout=request.timeLimit + 30,
            cwd='d:\\stackhack\\Stack_Hack\\timetable generatorv2'
            )
            
            if result.returncode == 2:
                # Feasibility errors
                return {
                    "status": "FEASIBILITY_ERROR",
                    "message": "Feasibility errors detected",
                    "errors": result.stderr.split('\n') if result.stderr else []
                }
            elif result.returncode == 3:
                # Infeasible
                return {
                    "status": "INFEASIBLE",
                    "message": "Solver could not find a feasible timetable."
                }
            elif result.returncode != 0:
                # Other errors
                raise HTTPException(status_code=500, detail=f"Solver failed: {result.stderr}")
            
            # Read output files
            sections = {}
            faculty = {}
            available_rooms = []
            available_faculty = []
            
            # Parse output files if they exist
            for output_file in output_dir.glob("*.csv"):
                if output_file.name.startswith("section_"):
                    section_name = output_file.stem.replace("section_", "")
                    sections[section_name] = parse_csv_to_schedule(output_file)
                elif output_file.name.startswith("faculty_"):
                    faculty_name = output_file.stem.replace("faculty_", "")
                    faculty[faculty_name] = parse_csv_to_schedule(output_file)
            
            return {
                "status": "OPTIMAL" if result.returncode == 0 else "FEASIBLE",
                "sections": sections,
                "faculty": faculty,
                "availableRooms": available_rooms,
                "availableFaculty": available_faculty,
                "objective_value": None
            }
            
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=408, detail="Solver timeout")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

def parse_csv_to_schedule(csv_file):
    """Parse CSV file to schedule format"""
    schedule = []
    try:
        import csv
        with open(csv_file, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Convert row to the expected format
                entry = {
                    "dayName": row.get('Day', ''),
                    "periodIndex": int(row.get('Period', 0)) if row.get('Period', '').isdigit() else 0,
                    "courseId": row.get('Course', ''),
                    "facultyId": row.get('Faculty', ''),
                    "roomId": row.get('Room', ''),
                    "sectionId": row.get('Section', ''),
                    "kind": "lecture"
                }
                schedule.append(entry)
    except Exception as e:
        print(f"Error parsing CSV {csv_file}: {e}")
    return schedule

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)