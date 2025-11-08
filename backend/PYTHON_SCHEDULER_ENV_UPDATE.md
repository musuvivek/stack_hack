# Python Scheduler Environment Variables Update

## Summary
This update makes the backend Python scheduler integration fully configurable through environment variables, replacing hardcoded paths and URLs.

## Changes Made

### 1. Environment Variables Added
- `PYTHON_SCHEDULER_URL`: Main Python scheduler URL (set to Streamlit app)
- `PYTHON_SCHEDULER_SCRIPT_PATH`: Path to Python scheduler main script
- `PYTHON_SCHEDULER_OUTPUT_PATH`: Path to Python scheduler output directory
- `PYTHON_SCHEDULER_OUTPUT_BASE_DIR`: Base directory for Python scheduler outputs

### 2. Files Updated

#### `backend/src/services/schedulerService.js`
- Updated to use `PYTHON_SCHEDULER_SCRIPT_PATH` and `PYTHON_SCHEDULER_OUTPUT_PATH` environment variables
- Maintains fallback to original hardcoded paths if environment variables are not set

#### `backend/src/services/externalImportService.js`
- Updated to use `PYTHON_SCHEDULER_OUTPUT_BASE_DIR` environment variable
- Maintains fallback to original hardcoded path if environment variable is not set

#### `backend/.env`
- Added all new Python scheduler environment variables
- Set `PYTHON_SCHEDULER_URL` to the Streamlit app URL

#### `backend/env.sample`
- Updated to include all new environment variables
- Updated default URL to Streamlit app

### 3. Current Configuration
```bash
PYTHON_SCHEDULER_URL=https://stack-hack-8q4fvj4xro4viyv4yedylw.streamlit.app/
PYTHON_SCHEDULER_SCRIPT_PATH=../timetable generatorv2/src/main.py
PYTHON_SCHEDULER_OUTPUT_PATH=../timetable generatorv2/TT_Flexinput_output
PYTHON_SCHEDULER_OUTPUT_BASE_DIR=../timetable generatorv2/out
```

## Benefits
- **Flexibility**: Easy to switch between local and remote Python schedulers
- **Configuration Management**: All paths and URLs are now configurable
- **Deployment Ready**: No hardcoded paths for different deployment environments
- **Backward Compatibility**: Fallback to original paths if environment variables are not set

## Usage
1. Update the `.env` file with your desired configuration
2. The backend will automatically use the environment variables
3. If environment variables are not set, it will fall back to the original hardcoded paths

## Notes
- The Streamlit app URL is now the default for the Python scheduler
- Local development can still use the local Python scheduler by updating the environment variables
- All paths are relative to the backend directory