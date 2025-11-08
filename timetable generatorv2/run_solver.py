#!/usr/bin/env python3
"""
Simple wrapper script to run the timetable solver from the correct directory.
"""

import sys
import os
import argparse
import subprocess

def main():
    parser = argparse.ArgumentParser(description="Timetable Solver Wrapper")
    parser.add_argument("--inputs", required=True, help="Directory containing input CSV files")
    parser.add_argument("--output", required=True, help="Directory to write outputs")
    parser.add_argument("--time_limit_sec", type=int, default=60, help="Solver time limit in seconds")
    parser.add_argument("--optimize_gaps", action="store_true", help="Minimize gaps (slower)")
    args = parser.parse_args()
    
    # Change to the project directory
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)
    
    # Add the src directory to Python path
    sys.path.insert(0, os.path.join(project_dir, 'src'))
    sys.path.insert(0, project_dir)
    
    # Import and run the main function
    from src.main import main as solver_main
    
    # Temporarily modify sys.argv to match what main expects
    original_argv = sys.argv[:]
    sys.argv = [
        'main.py',
        '--inputs', args.inputs,
        '--output', args.output,
        '--time_limit_sec', str(args.time_limit_sec)
    ]
    if args.optimize_gaps:
        sys.argv.append('--optimize_gaps')
    
    try:
        return solver_main()
    finally:
        sys.argv = original_argv

if __name__ == "__main__":
    sys.exit(main())