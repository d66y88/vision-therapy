import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { getDeviceId } from './deviceId'
import type { TrainingSession } from './trainingTypes'

interface VisionTherapyDB extends DBSchema {
  sessions: {
    key: number
    value: TrainingSession
    indexes: {
      'by-startedAt': string
      'by-module': string
      'by-syncId': string
    }
  }
}

const DB_NAME = 'vision-therapy'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<VisionTherapyDB>> | null = null

/**
 * Open (or reuse) the IndexedDB connection.
 */
export function getTrainingDb(): Promise<IDBPDatabase<VisionTherapyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VisionTherapyDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('sessions', {
            keyPath: 'id',
            autoIncrement: true,
          })
          store.createIndex('by-startedAt', 'startedAt')
          store.createIndex('by-module', 'module')
        }
        if (oldVersion < 2) {
          const store = tx.objectStore('sessions')
          store.createIndex('by-syncId', 'syncId')
          // Backfill stable syncId/deviceId onto existing local rows.
          const device = getDeviceId()
          let cursor = await store.openCursor()
          while (cursor) {
            const row = cursor.value
            if (!row.syncId) {
              row.syncId = crypto.randomUUID()
              if (!row.deviceId) row.deviceId = device
              await cursor.update(row)
            }
            cursor = await cursor.continue()
          }
        }
      },
    })
  }
  return dbPromise
}

/** Look up a local session by its cross-device syncId. */
export async function getSessionBySyncId(
  syncId: string,
): Promise<TrainingSession | undefined> {
  const db = await getTrainingDb()
  return db.getFromIndex('sessions', 'by-syncId', syncId)
}

/**
 * Insert a session pulled from the cloud if not already present locally
 * (dedupe by syncId). Returns true when a new row was added.
 */
export async function insertRemoteSession(
  session: TrainingSession,
): Promise<boolean> {
  if (!session.syncId) return false
  const existing = await getSessionBySyncId(session.syncId)
  if (existing) return false
  const db = await getTrainingDb()
  const { id: _omit, ...rest } = session
  void _omit
  await db.add('sessions', rest as TrainingSession)
  return true
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
