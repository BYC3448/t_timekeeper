import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  onSnapshot,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  ScheduleEvent,
  TodoItem,
  WeeklyTimetable,
  MorningBriefingItem,
  FirebaseConfig,
} from './types';
import type { AppSettings } from './storage';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let activeUnsubscribes: Unsubscribe[] = [];

/**
 * 환경 변수 또는 사용자 지정 Firebase 설정으로 Firebase 초기화
 */
export function initFirebase(config?: FirebaseConfig): boolean {
  try {
    const finalConfig = {
      apiKey: config?.apiKey || import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: config?.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: config?.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: config?.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: config?.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: config?.appId || import.meta.env.VITE_FIREBASE_APP_ID,
    };

    if (!finalConfig.apiKey || !finalConfig.projectId) {
      return false;
    }

    if (!getApps().length) {
      app = initializeApp(finalConfig);
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch {
        db = getFirestore(app);
      }
    } else {
      app = getApp();
      db = getFirestore(app);
    }

    return true;
  } catch (error) {
    console.warn('[Firebase] 초기화 실패 (로컬 스토리지 모드로 작동):', error);
    app = null;
    db = null;
    return false;
  }
}

export function isFirebaseConnected(): boolean {
  return db !== null;
}

export function getFirestoreInstance(): Firestore | null {
  return db;
}

/* =========================================================================
   공통 컬렉션 CRUD 헬퍼
   (teachers/{userId}/{collectionName} 문서 컬렉션 + teachers/{userId}/data/{collectionName}
   레거시 단일 문서로의 자동 fallback을 모든 엔티티가 동일하게 필요로 하므로 공통화)
   ========================================================================= */

async function fetchCollectionWithFallback<T>(
  userId: string,
  collectionName: string,
  label: string
): Promise<T[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'teachers', userId, collectionName));
    if (!snap.empty) return snap.docs.map((d) => d.data() as T);
    const legacyDoc = await getDoc(doc(db, 'teachers', userId, 'data', collectionName));
    if (legacyDoc.exists() && legacyDoc.data()?.items) return legacyDoc.data().items as T[];
    return [];
  } catch (e) {
    console.error(`[Firebase] fetch${label} 오류:`, e);
    return [];
  }
}

async function setDocMerge(
  userId: string,
  collectionName: string,
  id: string,
  data: object,
  label: string
): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, 'teachers', userId, collectionName, id);
    await setDoc(docRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (e) {
    console.error(`[Firebase] ${label} 오류:`, e);
  }
}

async function deleteFromCollection(
  userId: string,
  collectionName: string,
  id: string,
  label: string
): Promise<void> {
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'teachers', userId, collectionName, id));
  } catch (e) {
    console.error(`[Firebase] ${label} 오류:`, e);
  }
}

async function batchSetCollection<T extends { id: string }>(
  userId: string,
  collectionName: string,
  items: T[],
  label: string
): Promise<void> {
  if (!db || !Array.isArray(items)) return;
  try {
    const batch = writeBatch(db);
    items.forEach((item) => {
      const docRef = doc(db!, 'teachers', userId, collectionName, item.id);
      batch.set(docRef, { ...item, updatedAt: new Date().toISOString() }, { merge: true });
    });
    await batch.commit();
  } catch (e) {
    console.error(`[Firebase] ${label} 오류:`, e);
  }
}

async function syncAllToCollection<T extends { id: string }>(
  userId: string,
  collectionName: string,
  items: T[],
  label: string
): Promise<void> {
  if (!db || !Array.isArray(items)) return;
  try {
    const batch = writeBatch(db);
    items.forEach((item) => {
      const docRef = doc(db!, 'teachers', userId, collectionName, item.id);
      batch.set(docRef, { ...item, updatedAt: new Date().toISOString() }, { merge: true });
    });
    // 레거시 단일 문서 백업도 함께 동기화
    const legacyDoc = doc(db, 'teachers', userId, 'data', collectionName);
    batch.set(legacyDoc, { items, updatedAt: new Date().toISOString() });
    await batch.commit();
  } catch (e) {
    console.error(`[Firebase] ${label} 오류:`, e);
  }
}

function subscribeCollectionWithFallback<T>(
  userId: string,
  collectionName: string,
  cb: (items: T[]) => void
): Unsubscribe {
  return onSnapshot(collection(db!, 'teachers', userId, collectionName), (snap) => {
    if (!snap.empty) {
      cb(snap.docs.map((d) => d.data() as T));
    } else {
      // 컬렉션이 비었으면 레거시 단일 문서 확인
      getDoc(doc(db!, 'teachers', userId, 'data', collectionName)).then((legacySnap) => {
        if (legacySnap.exists() && legacySnap.data()?.items) {
          cb(legacySnap.data().items);
        }
      });
    }
  });
}

/* =========================================================================
   1. 학사일정 및 마감 이벤트 (Events)
   ========================================================================= */

export async function fetchEventsFromFirestore(userId = 'default_teacher'): Promise<ScheduleEvent[]> {
  return fetchCollectionWithFallback<ScheduleEvent>(userId, 'events', 'Events');
}

export async function addEventToFirestore(event: ScheduleEvent, userId = 'default_teacher'): Promise<void> {
  return setDocMerge(userId, 'events', event.id, event, 'addEvent');
}

export async function deleteEventFromFirestore(id: string, userId = 'default_teacher'): Promise<void> {
  return deleteFromCollection(userId, 'events', id, 'deleteEvent');
}

export async function syncAllEventsToFirestore(events: ScheduleEvent[], userId = 'default_teacher'): Promise<void> {
  return syncAllToCollection(userId, 'events', events, 'syncAllEvents');
}

/* =========================================================================
   2. 실행 과업 (To-Do Items)
   ========================================================================= */

export async function fetchTodosFromFirestore(userId = 'default_teacher'): Promise<TodoItem[]> {
  return fetchCollectionWithFallback<TodoItem>(userId, 'todos', 'Todos');
}

export async function addTodosToFirestore(todos: TodoItem[], userId = 'default_teacher'): Promise<void> {
  return batchSetCollection(userId, 'todos', todos, 'addTodos');
}

export async function toggleTodoInFirestore(id: string, isCompleted: boolean, userId = 'default_teacher'): Promise<void> {
  return setDocMerge(userId, 'todos', id, { isCompleted }, 'toggleTodo');
}

export async function deleteTodoFromFirestore(id: string, userId = 'default_teacher'): Promise<void> {
  return deleteFromCollection(userId, 'todos', id, 'deleteTodo');
}

export async function syncAllTodosToFirestore(todos: TodoItem[], userId = 'default_teacher'): Promise<void> {
  return syncAllToCollection(userId, 'todos', todos, 'syncAllTodos');
}

/* =========================================================================
   3. 주간 시간표 (Weekly Timetable)
   ========================================================================= */

export async function fetchTimetableFromFirestore(userId = 'default_teacher'): Promise<WeeklyTimetable | null> {
  if (!db) return null;
  try {
    const docRef = doc(db, 'teachers', userId, 'timetable', 'weekly');
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data()?.data) {
      return snap.data().data as WeeklyTimetable;
    }
    const legacyDoc = await getDoc(doc(db, 'teachers', userId, 'data', 'timetable'));
    if (legacyDoc.exists() && legacyDoc.data()?.data) {
      return legacyDoc.data().data as WeeklyTimetable;
    }
    return null;
  } catch (e) {
    console.error('[Firebase] fetchTimetable 오류:', e);
    return null;
  }
}

export async function saveTimetableToFirestore(timetable: WeeklyTimetable, userId = 'default_teacher'): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, 'teachers', userId, 'timetable', 'weekly');
    await setDoc(docRef, { data: timetable, updatedAt: new Date().toISOString() }, { merge: true });
    // 레거시 경로도 백업
    const legacyDoc = doc(db, 'teachers', userId, 'data', 'timetable');
    await setDoc(legacyDoc, { data: timetable, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (e) {
    console.error('[Firebase] saveTimetable 오류:', e);
  }
}

/* =========================================================================
   4. 조·종례 전달사항 (Morning Briefings)
   ========================================================================= */

export async function fetchBriefingsFromFirestore(userId = 'default_teacher'): Promise<MorningBriefingItem[]> {
  return fetchCollectionWithFallback<MorningBriefingItem>(userId, 'briefings', 'Briefings');
}

export async function addBriefingToFirestore(briefing: MorningBriefingItem, userId = 'default_teacher'): Promise<void> {
  return setDocMerge(userId, 'briefings', briefing.id, briefing, 'addBriefing');
}

export async function toggleBriefingInFirestore(id: string, isDone: boolean, userId = 'default_teacher'): Promise<void> {
  return setDocMerge(userId, 'briefings', id, { isDone }, 'toggleBriefing');
}

export async function deleteBriefingFromFirestore(id: string, userId = 'default_teacher'): Promise<void> {
  return deleteFromCollection(userId, 'briefings', id, 'deleteBriefing');
}

export async function syncAllBriefingsToFirestore(briefings: MorningBriefingItem[], userId = 'default_teacher'): Promise<void> {
  return syncAllToCollection(userId, 'briefings', briefings, 'syncAllBriefings');
}

/* =========================================================================
   5. 교사 프로필 및 앱 설정 (Settings)
   ========================================================================= */

export async function fetchSettingsFromFirestore(userId = 'default_teacher'): Promise<Partial<AppSettings> | null> {
  if (!db) return null;
  try {
    const docRef = doc(db, 'teachers', userId, 'settings', 'main');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as Partial<AppSettings>;
    }
    return null;
  } catch (e) {
    console.error('[Firebase] fetchSettings 오류:', e);
    return null;
  }
}

export async function saveSettingsToFirestore(settings: Partial<AppSettings>, userId = 'default_teacher'): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, 'teachers', userId, 'settings', 'main');
    await setDoc(docRef, { ...settings, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (e) {
    console.error('[Firebase] saveSettings 오류:', e);
  }
}

/* =========================================================================
   6. Firestore 실시간 리스너 구독 (Realtime Subscriptions)
   ========================================================================= */

export function subscribeToTeacherData(
  userId = 'default_teacher',
  callbacks: {
    onEvents?: (events: ScheduleEvent[]) => void;
    onTodos?: (todos: TodoItem[]) => void;
    onTimetable?: (timetable: WeeklyTimetable) => void;
    onBriefings?: (briefings: MorningBriefingItem[]) => void;
    onSettings?: (settings: Partial<AppSettings>) => void;
  }
): () => void {
  // 기존 구독 해제
  activeUnsubscribes.forEach((unsub) => unsub());
  activeUnsubscribes = [];

  if (!db) return () => {};

  try {
    if (callbacks.onEvents) {
      activeUnsubscribes.push(subscribeCollectionWithFallback(userId, 'events', callbacks.onEvents));
    }

    if (callbacks.onTodos) {
      activeUnsubscribes.push(subscribeCollectionWithFallback(userId, 'todos', callbacks.onTodos));
    }

    if (callbacks.onTimetable) {
      const unsub = onSnapshot(doc(db, 'teachers', userId, 'timetable', 'weekly'), (snap) => {
        if (snap.exists() && snap.data()?.data) {
          callbacks.onTimetable?.(snap.data().data);
        } else {
          getDoc(doc(db!, 'teachers', userId, 'data', 'timetable')).then((legacySnap) => {
            if (legacySnap.exists() && legacySnap.data()?.data) {
              callbacks.onTimetable?.(legacySnap.data().data);
            }
          });
        }
      });
      activeUnsubscribes.push(unsub);
    }

    if (callbacks.onBriefings) {
      activeUnsubscribes.push(subscribeCollectionWithFallback(userId, 'briefings', callbacks.onBriefings));
    }

    if (callbacks.onSettings) {
      const unsub = onSnapshot(doc(db, 'teachers', userId, 'settings', 'main'), (snap) => {
        if (snap.exists()) {
          callbacks.onSettings?.(snap.data() as Partial<AppSettings>);
        }
      });
      activeUnsubscribes.push(unsub);
    }
  } catch (e) {
    console.error('[Firebase] 실시간 구독 설정 오류:', e);
  }

  return () => {
    activeUnsubscribes.forEach((unsub) => unsub());
    activeUnsubscribes = [];
  };
}

/* =========================================================================
   7. 초기 데이터 마이그레이션 / 자동 시딩
   ========================================================================= */

export async function seedInitialDataIfEmpty(
  userId = 'default_teacher',
  initial: {
    events: ScheduleEvent[];
    todos: TodoItem[];
    timetable: WeeklyTimetable;
    briefings: MorningBriefingItem[];
    settings?: AppSettings;
  }
): Promise<boolean> {
  if (!db) return false;
  try {
    const existingEvents = await fetchEventsFromFirestore(userId);
    if (existingEvents.length === 0 && initial.events.length > 0) {
      console.log('[Firebase] Firestore 초기 데이터 자동 시딩 진행...');
      await syncAllEventsToFirestore(initial.events, userId);
      await syncAllTodosToFirestore(initial.todos, userId);
      await saveTimetableToFirestore(initial.timetable, userId);
      await syncAllBriefingsToFirestore(initial.briefings, userId);
      if (initial.settings) {
        await saveSettingsToFirestore(initial.settings, userId);
      }
      return true;
    }
    return false;
  } catch (e) {
    console.error('[Firebase] 초기 데이터 시딩 오류:', e);
    return false;
  }
}
