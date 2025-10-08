/**
 * Firebase Activity Logging System
 *
 * Tracks user actions (add/update/delete) on notes and syncs to Firebase.
 * - Automatically assigns a unique UID to each user (stored in localStorage)
 * - Logs are automatically cleaned up after 48 hours
 * - Log format: "user ${uid} added/updated/deleted EP.X MapName CH.Y"
 */

import { ref } from 'vue';
import { db } from '../firebase';
import { ref as dbRef, push, set, query, orderByChild, startAt, get, remove, onValue } from 'firebase/database';
import { getUserId } from '../utils/userUtils';
import type { Note } from '../types/Note';

export interface ActivityLog {
  id: string;
  userId: string;
  action: 'added' | 'updated' | 'deleted';
  noteInfo: string;
  timestamp: number;
}

export function useFirebaseLogs() {
  const logsRef = dbRef(db, 'activity_logs');
  const logs = ref<ActivityLog[]>([]);

  // Listen to real-time log updates
  const initLogsListener = () => {
    const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
    const recentLogsQuery = query(
      logsRef,
      orderByChild('timestamp'),
      startAt(fortyEightHoursAgo)
    );

    onValue(recentLogsQuery, (snapshot) => {
      if (snapshot.exists()) {
        const logsData = snapshot.val();
        logs.value = Object.entries(logsData).map(([id, log]: [string, any]) => ({
          id,
          ...log,
        }));
      } else {
        logs.value = [];
      }
    });
  };

  // Create a log entry
  const createLog = async (action: 'added' | 'updated' | 'deleted', note: Note, noteText?: string) => {
    try {
      const userId = getUserId();
      const displayText = noteText || note.noteText || `Map ${note.mapLevel}`;
      const noteInfo = `Lv.${note.mapLevel} ${displayText} CH.${note.channel}`;

      const logEntry: Omit<ActivityLog, 'id'> = {
        userId,
        action,
        noteInfo,
        timestamp: Date.now(),
      };

      const newLogRef = push(logsRef);
      await set(newLogRef, logEntry);

      // Clean up old logs (older than 48 hours)
      await cleanupOldLogs();
    } catch (error) {
      console.error('Failed to create log:', error);
    }
  };

  // Remove logs older than 48 hours
  const cleanupOldLogs = async () => {
    try {
      const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
      const logsSnapshot = await get(logsRef);

      if (logsSnapshot.exists()) {
        const logs = logsSnapshot.val();
        const deletePromises: Promise<void>[] = [];

        Object.entries(logs).forEach(([logId, log]: [string, any]) => {
          if (log.timestamp < fortyEightHoursAgo) {
            deletePromises.push(remove(dbRef(db, `activity_logs/${logId}`)));
          }
        });

        if (deletePromises.length > 0) {
          await Promise.all(deletePromises);
          console.log(`Cleaned up ${deletePromises.length} old logs`);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  };

  // Get recent logs (within 48 hours)
  const getRecentLogs = async (): Promise<ActivityLog[]> => {
    try {
      const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
      const recentLogsQuery = query(
        logsRef,
        orderByChild('timestamp'),
        startAt(fortyEightHoursAgo)
      );

      const snapshot = await get(recentLogsQuery);
      if (snapshot.exists()) {
        const logs = snapshot.val();
        return Object.entries(logs).map(([id, log]: [string, any]) => ({
          id,
          ...log,
        }));
      }
      return [];
    } catch (error) {
      console.error('Failed to get recent logs:', error);
      return [];
    }
  };

  return {
    logs,
    createLog,
    cleanupOldLogs,
    getRecentLogs,
    initLogsListener,
  };
}
