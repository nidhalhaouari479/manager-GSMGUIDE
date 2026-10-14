import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Write logs OUTSIDE the project dir so Next.js Fast Refresh is NOT triggered
const LOGS_DIR = path.join(os.tmpdir(), 'gsm1-audit');
const LOGS_FILE = path.join(LOGS_DIR, 'audit_logs.json');
const MAX_LOGS = 300;

// Helper to ensure the logs file exists and is valid JSON
async function ensureLogsFile() {
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
    try {
      const data = await fs.readFile(LOGS_FILE, 'utf8');
      JSON.parse(data); // Test if it's valid JSON
    } catch {
      await fs.writeFile(LOGS_FILE, JSON.stringify([]));
    }
  } catch (error) {
    console.error('Error ensuring logs file:', error);
  }
}

export async function GET() {
  try {
    await ensureLogsFile();
    const data = await fs.readFile(LOGS_FILE, 'utf8');
    let logs = [];
    try {
      logs = JSON.parse(data);
    } catch {
      logs = [];
    }
    return NextResponse.json({ success: true, logs, debug: 'API IS ALIVE' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureLogsFile();
    const newLog = await request.json();
    
    if (!newLog || typeof newLog !== 'object') {
      throw new Error('Invalid log entry');
    }

    const data = await fs.readFile(LOGS_FILE, 'utf8');
    let logs = [];
    try {
      logs = JSON.parse(data);
      if (!Array.isArray(logs)) logs = [];
    } catch {
      logs = [];
    }
    
    // Add new log at the beginning and limit size
    logs = [newLog, ...logs].slice(0, MAX_LOGS);
    
    await fs.writeFile(LOGS_FILE, JSON.stringify(logs, null, 2));
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API POST Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await ensureLogsFile();
    await fs.writeFile(LOGS_FILE, JSON.stringify([]));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
