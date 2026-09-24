import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Stream directly to Firebase stdin. Never log the key or write a temporary copy.
process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const key = process.env.OPENAI_API_KEY?.trim();
if (!key) throw new Error('.env에 OPENAI_API_KEY를 입력해 주세요.');
const env = { ...process.env };
delete env.OPENAI_API_KEY;
const child = spawn('firebase', [
  'functions:secrets:set', 'OPENAI_API_KEY', '--data-file', '-',
  '--project', 'jansori-28924', '--non-interactive',
], { stdio: ['pipe', 'inherit', 'inherit'], env });
child.stdin.on('error', () => {});
child.on('error', () => { console.error('Firebase CLI를 실행하지 못했습니다.'); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
child.stdin.end(key);
