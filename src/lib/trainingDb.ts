import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { TrainingSession } from './trainingTypes'

interface VisionTherapyDB extends DBSchema {
  sessions: {
    key: number
    value: TrainingSession
    indexes: {
      'by-startedAt': string
      'by-module': string
    }
  }
}

const DB_NAME = 'vision-therapy'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<VisionTherapyDB>> | null = null

/**
 * Open (or reuse) the IndexedDB connection.
 */
export function getTrainingDb(): Promise<IDBPDatabase<VisionTherapyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VisionTherapyDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('sessions', {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('by-startedAt', 'startedAt')
        store.createIndex('by-module', 'module')
      },
    })
  }
  return dbPromise
}

/**
 * Persist one completed training session.
 */
export async function saveTrainingSession(
  session: Omit<TrainingSession, 'id'>,
): Promise<number> {
  const db = await getTrainingDb()
  return db.add('sessions', session as TrainingSession)
}

/**
 * Load all sessions ordered by start time ascending (for charts).
 */
export async function listTrainingSessions(): Promise<TrainingSession[]> {
  const db = await getTrainingDb()
  const rows = await db.getAllFromIndex('sessions', 'by-startedAt')
  return rows
}

/**
 * Delete every stored session (parent reset).
 */
export async function clearTrainingSessions(): Promise<void> {
  const db = await getTrainingDb()
  await db.clear('sessions')
}

/**
 * Export all sessions as a downloadable JSON payload for clinicians.
 */
export async function exportTrainingSessionsJson(): Promise<string> {
  const sessions = await listTrainingSessions()
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'vision-therapy',
      sessions,
    },
    null,
    2,
  )
}

/**
 * Compute average of finite numbers; returns null when empty.
 */
export function average(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return null
  return finite.reduce((a, b) => a + b, 0) / finite.length
}
