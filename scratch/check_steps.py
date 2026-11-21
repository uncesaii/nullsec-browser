import subprocess, json, sys

run_id = sys.argv[1] if len(sys.argv) > 1 else '44896940702'
out = subprocess.check_output(['gh', 'run', 'view', run_id, '--repo', 'uncesaii/nullsec-browser', '--json', 'jobs'])
data = json.loads(out)
for job in data.get('jobs', []):
    if job.get('name') == 'windows64':
        print(f"=== Job: {job.get('name')} status={job.get('status')} conclusion={job.get('conclusion')} ===")
        for s in job.get('steps', []):
            print(f"  {s['name']}: {s.get('status')} ({s.get('conclusion')}) started={s.get('startedAt')}")
