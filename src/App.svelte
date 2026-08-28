<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Header from './components/Header.svelte';
  import GlobalDropZone from './components/GlobalDropZone.svelte';
  import { TodayPage, CalendarPage, type AppRoute } from './routes';
  import AIReviewModal from './components/AIReviewModal.svelte';
  import SourceViewerModal from './components/SourceViewerModal.svelte';
  import TimetableModal from './components/TimetableModal.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import TextInputModal from './components/TextInputModal.svelte';
  import OnboardingModal from './components/OnboardingModal.svelte';

  import { Storage, type AppSettings } from './lib/storage';
  import { initFirebase, subscribeToTeacherData, seedInitialDataIfEmpty } from './lib/firebase';
  import type { ScheduleEvent, TodoItem, WeeklyTimetable, MorningBriefingItem, AIParsedResult, MultiParsedItem } from './lib/types';
  import { SAMPLE_NOTICE_IMAGE, DEMO_AI_PARSED } from './lib/mockData';
  import { parseTeacherInboxWithGemini, type ParseResultData } from './lib/gemini';
  import { parseDocumentWithUpstage } from './lib/upstage';
  import { format, subDays, parseISO } from 'date-fns';
  import confetti from 'canvas-confetti';
  import { RotateCcw, Trash2 } from 'lucide-svelte';

  // 앱 코어 상태
  let events: ScheduleEvent[] = [];
  let todos: TodoItem[] = [];
  let timetable: WeeklyTimetable | null = null;
  let briefings: MorningBriefingItem[] = [];
  let settings: AppSettings | null = null;
  let firebaseConnected = false;

  let selectedDate: Date = new Date();
  let isProcessing = false;
  let activeTab: AppRoute = 'today';

  // URL 해시 라우팅 동기화
  function updateRouteFromHash() {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    if (hash === 'calendar') {
      activeTab = 'calendar';
    } else {
      activeTab = 'today';
    }
  }

  // 모달 상태
  let isReviewOpen = false;
  let currentParsed: (AIParsedResult & {
    type?: string;
    mineReason?: string;
    ignored?: { text: string; reason: string }[];
  }) | null = null;
  let multiParsed: MultiParsedItem[] = [];
  let undoToast: {
    item: TodoItem;
    title: string;
  } | null = null;
  let undoTimer: any = null;

  let currentSourceImage: string | undefined = undefined;
  let currentSourceText: string | undefined = undefined;
  let currentFileName: string | undefined = undefined;

  let isSourceOpen = false;
  let sourceModalData: {
    title: string;
    sourceImage?: string;
    sourceText?: string;
    date?: string;
    fileName?: string;
    category?: string;
  } | null = null;

  let isTimetableOpen = false;
  let isSettingsOpen = false;
  let isTextInputOpen = false;
  let isOnboardingOpen = false;

  // 데이터 로드 및 Firebase / 라우터 초기화
  onMount(async () => {
    updateRouteFromHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', updateRouteFromHash);
    }

    events = Storage.getEvents();
    todos = Storage.getTodos();
    timetable = Storage.getTimetable();
    briefings = Storage.getBriefings();
    settings = Storage.getSettings();

    if (!Storage.getOnboardingCompleted()) {
      isOnboardingOpen = true;
    }

    // Firebase 초기화 시도
    firebaseConnected = initFirebase(settings?.firebaseConfig);
    if (firebaseConnected) {
      subscribeToTeacherData('default_teacher', {
        onEvents: (cloudEvents) => { if (cloudEvents && cloudEvents.length > 0) events = cloudEvents; },
        onTodos: (cloudTodos) => { if (cloudTodos && cloudTodos.length > 0) todos = cloudTodos; },
        onTimetable: (cloudTimetable) => { if (cloudTimetable) timetable = cloudTimetable; },
        onBriefings: (cloudBriefings) => { if (cloudBriefings && cloudBriefings.length > 0) briefings = cloudBriefings; },
      });

      await seedInitialDataIfEmpty('default_teacher', {
        events,
        todos,
        timetable: timetable || Storage.getTimetable(),
        briefings,
        settings: settings || Storage.getSettings(),
      });
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('hashchange', updateRouteFromHash);
    }
  });

  // 온보딩 완료 핸들러
  function handleOnboardingComplete(e: CustomEvent) {
    const { profile, timetable: parsedTimetable, calendarItems } = e.detail;

    if (profile) {
      const newSettings: AppSettings = {
        ...(settings!),
        teacherName: profile.teacherName,
        schoolName: profile.schoolName,
        profile: {
          schoolName: profile.schoolName,
          teacherName: profile.teacherName,
          isHomeroom: profile.isHomeroom,
          homeroomClass: profile.homeroomClass,
          department: profile.department,
          position: profile.position,
          subjects: profile.subjects,
          extraDuties: profile.extraDuties,
        },
      };
      settings = newSettings;
      Storage.saveSettings(newSettings);
    }

    if (parsedTimetable) {
      timetable = Storage.saveTimetable(parsedTimetable);
      confetti({ particleCount: 40 });
    }

    if (calendarItems && calendarItems.length > 0) {
      const catMap: Record<string, string> = {
        '평가': 'exam', '생기부': 'document', '행정': 'document',
        '연수': 'meeting', '상담': 'student', '회의': 'meeting',
        '수업': 'event', '행사': 'event', '기타': 'general',
      };
      const newEvents: ScheduleEvent[] = calendarItems.map((item: any) => ({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: item.title,
        date: item.date || format(new Date(), 'yyyy-MM-dd'),
        category: (catMap[item.category] || 'general') as ScheduleEvent['category'],
        priority: (item.overdue ? 'urgent' : 'medium') as ScheduleEvent['priority'],
        description: item.mineReason || item.note,
        sourceType: 'manual' as const,
        createdAt: new Date().toISOString(),
      }));
      events = Storage.saveEvents([...newEvents, ...events]);
    }

    Storage.setOnboardingCompleted(true);
    isOnboardingOpen = false;
  }

  // 전체 리셋 핸들러
  function handleResetData() {
    Storage.resetToDefault();
    events = Storage.getEvents();
    todos = Storage.getTodos();
    timetable = Storage.getTimetable();
    briefings = Storage.getBriefings();
    confetti({ particleCount: 30 });
  }

  // 공문/스샷/텍스트 투척 처리 핸들러 (Ctrl+V, 텍스트 모달, 드래그앤드롭)
  async function handleProcessInput(input: {
    type: 'image' | 'text' | 'hwp';
    data: string;
    fileName?: string;
    mimeType?: string;
  }) {
    isProcessing = true;
    currentFileName = input.fileName;

    let imageBase64: string | undefined = undefined;
    let textContent: string | undefined = undefined;

    if (input.type === 'image') {
      imageBase64 = input.data;
      currentSourceImage = input.data;
      currentSourceText = undefined;
    } else if (input.type === 'text') {
      textContent = input.data;
      currentSourceText = input.data;
      currentSourceImage = undefined;
    } else if (input.type === 'hwp') {
      try {
        textContent = await parseDocumentWithUpstage({
          fileBase64: input.data,
          fileName: input.fileName || 'document.hwp',
        });
      } catch (err: any) {
        alert(`HWP 파싱 오류: ${err.message}`);
        isProcessing = false;
        return;
      }
      currentSourceText = textContent;
      currentSourceImage = undefined;
    }

    try {
      // 파싱프롬프트.md 공식 지시문으로 분석 실행 (API 키는 /api/gemini 서버에서 처리)
      const result: ParseResultData = await parseTeacherInboxWithGemini({
        imageFileBase64: imageBase64,
        mimeType: input.mimeType,
        textContent: textContent,
        teacherContext: {
          today: format(new Date(), 'yyyy-MM-dd'),
          subject: settings?.profile?.subjects || '2학년 물리학Ⅰ, 3학년 생활과 과학',
          duty: `${settings?.profile?.schoolName || '새솔고'} ${settings?.teacherName || '선생님'} | 담임: ${settings?.profile?.homeroomClass || '3학년 2반'} | 소속/보직: ${settings?.profile?.department || '진로진학부, 과학과 교과주임'} | 주요업무: ${settings?.profile?.extraDuties || '수능 응시원서 접수 총괄, 과학교구 예산 추경 관리'}`,
        },
      });

      // 1. 시간표로 인식된 경우
      if (result.kind === '시간표' && result.timetable) {
        timetable = Storage.saveTimetable(result.timetable);
        isTimetableOpen = true;
        confetti({ particleCount: 60 });
        alert('🎉 주간 시간표가 감지되어 내 시간표로 자동 등록되었습니다!\n과목과 반이 정상 배치되었는지 확인해 보세요.');
        return;
      }

      // 2. 업무 지시 또는 공문 / 연간 학사일정으로 인식된 경우
      if (result.items && result.items.length > 0) {
        // [다중 일정 모드] 항목이 2개 이상일 때 (연간 학사일정, 주간 업무표 등)
        if (result.items.length > 1) {
          const multiList: MultiParsedItem[] = result.items.map((it, idx) => {
            let cat: any = 'general';
            if (it.category === '평가') cat = 'exam';
            else if (it.category === '생기부' || it.category === '행정') cat = 'document';
            else if (it.category === '상담') cat = 'student';
            else if (it.category === '회의' || it.category === '연수') cat = 'meeting';
            else if ((it.category as string) === '행사') cat = 'event';

            return {
              id: `multi-${Date.now()}-${idx}`,
              title: it.title,
              date: it.date || format(new Date(), 'yyyy-MM-dd'),
              category: cat,
              priority: it.overdue ? 'urgent' : 'high',
              type: it.type || '고정',
              isMine: it.isMine,
              mineReason: it.mineReason,
              confidence: it.confidence,
              steps: it.steps,
              selected: it.isMine, // 내 일은 자동 체크
            };
          });

          multiParsed = multiList;
          currentParsed = null;
          isReviewOpen = true;
          return;
        }

        // [단일 일정 모드] 항목이 1개일 때
        const primaryItem = result.items[0];
        multiParsed = [];

        // steps가 있다면 To-Do로 연동
        const subTasks = (primaryItem.steps || []).map((step, idx) => ({
          title: step,
          daysBefore: (primaryItem.steps?.length || 1) - idx,
          calculatedDate: primaryItem.date || format(new Date(), 'yyyy-MM-dd'),
        }));

        if (subTasks.length === 0 && primaryItem.date) {
          subTasks.push({
            title: `${primaryItem.title} 세부 계획 확인 및 착수`,
            daysBefore: 3,
            calculatedDate: format(subDays(parseISO(primaryItem.date), 3), 'yyyy-MM-dd'),
          });
        }

        // 카테고리 매핑
        let category: any = 'general';
        if (primaryItem.category === '평가') category = 'exam';
        else if (primaryItem.category === '생기부' || primaryItem.category === '행정') category = 'document';
        else if (primaryItem.category === '상담') category = 'student';
        else if (primaryItem.category === '회의' || primaryItem.category === '연수') category = 'meeting';

        currentParsed = {
          title: primaryItem.title,
          date: primaryItem.date || format(new Date(), 'yyyy-MM-dd'),
          category: category,
          priority: primaryItem.overdue ? 'urgent' : 'high',
          summary: primaryItem.note || primaryItem.originalText || primaryItem.title,
          studentNotice: null,
          subTasks: subTasks,
          type: primaryItem.type,
          mineReason: primaryItem.mineReason,
          ignored: result.ignored || [],
        };

        isReviewOpen = true;
      } else {
        alert(result.note || '자료에서 일정을 감지하지 못했습니다. 직접 할 일을 추가해 보세요.');
      }
    } catch (err: any) {
      alert(`AI 분석 오류: ${err.message}\n설정에서 Gemini API 키를 확인하시거나 시연용 데모를 이용해 주세요.`);
    } finally {
      isProcessing = false;
    }
  }

  // 발표 시연용 원클릭 데모 실행 핸들러
  function handleRunDemo() {
    isProcessing = true;
    currentFileName = '2026_지필평가_출제공문_스샷.png';
    currentSourceImage = SAMPLE_NOTICE_IMAGE;
    currentSourceText = undefined;

    setTimeout(() => {
      isProcessing = false;
      currentParsed = {
        ...DEMO_AI_PARSED,
        type: '마감',
        mineReason: '2학년 담당 교과이므로',
        ignored: [
          { text: '교육연수부-1427(2026. 7. 21.)', reason: '근거 문서 번호' },
          { text: '교무기획부 기안일시(2026. 8. 20.)', reason: '접수일자' },
        ],
      };
      isReviewOpen = true;
    }, 900);
  }

  // 교사의 AI 파싱 검토 완료 및 최종 등록
  function handleConfirmReview(detail: {
    event: Omit<ScheduleEvent, 'id' | 'createdAt'>;
    todos: Omit<TodoItem, 'id' | 'createdAt'>[];
    studentNotice?: string;
    registerType?: 'todo_only' | 'deadline_event';
  }) {
    const isTodoOnly = detail.registerType === 'todo_only';
    const eventId = isTodoOnly ? undefined : `evt-${Date.now()}`;
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // 1. 이벤트 등록 (캘린더 & D-Day: deadline_event 모드일 때만 등록)
    if (!isTodoOnly) {
      const newEvent: ScheduleEvent = {
        ...detail.event,
        id: eventId!,
        createdAt: todayStr,
      };
      events = Storage.addEvent(newEvent);
    }

    // 2. 역산된 세부 To-Do 등록 (오늘 꼭 해야 할 일에 최소 1건 이상 100% 꽂히도록 보장)
    let rawTodos = [...detail.todos];
    if (rawTodos.length === 0) {
      rawTodos.push({
        title: detail.event.title,
        date: todayStr,
        deadlineDate: detail.event.date || todayStr,
        isCompleted: false,
        priority: detail.event.priority,
        tag: detail.event.category === 'exam' ? '출제' : '공문',
      });
    } else {
      const hasToday = rawTodos.some((t) => t.date === todayStr);
      if (!hasToday) {
        rawTodos[0] = {
          ...rawTodos[0],
          date: todayStr,
        };
      }
    }

    const newTodos: TodoItem[] = rawTodos.map((t, idx) => ({
      ...t,
      id: `todo-${Date.now()}-${idx}`,
      eventId: eventId,
      eventTitle: detail.event.title,
      createdAt: todayStr,
      sourceImage: t.sourceImage || detail.event.sourceImage,
      sourceText: t.sourceText || detail.event.sourceText,
      fileName: t.fileName || detail.event.fileName,
    }));
    todos = Storage.addTodos(newTodos);

    // 3. 조·종례 전달사항 추가
    if (detail.studentNotice) {
      briefings = Storage.addBriefing(detail.studentNotice, 'announcement');
    }

    isReviewOpen = false;

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  }

  // 다중 일정 일괄 등록 핸들러
  function handleConfirmMulti(selectedItems: MultiParsedItem[]) {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const newEvents: ScheduleEvent[] = selectedItems.map((item, idx) => ({
      id: `evt-${Date.now()}-${idx}`,
      title: item.title,
      date: item.date,
      category: item.category,
      priority: item.priority,
      description: item.mineReason || item.title,
      sourceType: currentSourceImage ? 'clipboard_image' : 'clipboard_text',
      sourceImage: currentSourceImage,
      sourceText: currentSourceText,
      fileName: currentFileName,
      createdAt: todayStr,
    }));

    events = Storage.saveEvents([...newEvents, ...Storage.getEvents()]);
    isReviewOpen = false;

    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 },
    });

    alert(`🎉 총 ${selectedItems.length}개의 학사일정이 캘린더에 일괄 등록되었습니다!`);
  }

  // 원본 보기 모달 오픈
  function handleViewSource(item: {
    title: string;
    sourceImage?: string;
    sourceText?: string;
    date?: string;
    fileName?: string;
    category?: string;
  }) {
    sourceModalData = item;
    isSourceOpen = true;
  }

  // To-Do 액션 핸들러
  function handleToggleTodo(id: string) {
    todos = Storage.toggleTodo(id);
  }

  function handleDeleteTodo(id: string) {
    const target = todos.find((t) => t.id === id);
    todos = Storage.deleteTodo(id);
    if (target) {
      undoToast = { item: target, title: target.title };
      if (undoTimer) clearTimeout(undoTimer);
      undoTimer = setTimeout(() => {
        undoToast = null;
      }, 6000);
    }
  }

  function handleUndoDelete() {
    if (undoToast) {
      todos = Storage.addTodos([undoToast.item]);
      undoToast = null;
      confetti({ particleCount: 30 });
    }
  }

  function handleAddCustomTodo(title: string, tag?: TodoItem['tag']) {
    const todayStr = format(selectedDate, 'yyyy-MM-dd');
    const newTodo: TodoItem = {
      id: `todo-${Date.now()}`,
      title,
      date: todayStr,
      isCompleted: false,
      priority: 'medium',
      tag: tag || '일반',
      createdAt: todayStr,
    };
    todos = Storage.addTodos([newTodo]);
  }

  // 조·종례 액션 핸들러
  function handleToggleBriefing(id: string) {
    briefings = Storage.toggleBriefing(id);
  }

  function handleAddBriefing(content: string) {
    briefings = Storage.addBriefing(content);
  }

  // 시간표 저장
  function handleSaveTimetable(updated: WeeklyTimetable) {
    timetable = Storage.saveTimetable(updated);
  }

  // 설정 저장
  async function handleSaveSettings(newSettings: AppSettings) {
    Storage.saveSettings(newSettings);
    settings = newSettings;

    if (newSettings.firebaseConfig) {
      firebaseConnected = initFirebase(newSettings.firebaseConfig);
      if (firebaseConnected) {
        subscribeToTeacherData('default_teacher', {
          onEvents: (cloudEvents) => { if (cloudEvents && cloudEvents.length > 0) events = cloudEvents; },
          onTodos: (cloudTodos) => { if (cloudTodos && cloudTodos.length > 0) todos = cloudTodos; },
          onTimetable: (cloudTimetable) => { if (cloudTimetable) timetable = cloudTimetable; },
          onBriefings: (cloudBriefings) => { if (cloudBriefings && cloudBriefings.length > 0) briefings = cloudBriefings; },
        });

        await seedInitialDataIfEmpty('default_teacher', {
          events,
          todos,
          timetable: timetable || Storage.getTimetable(),
          briefings,
          settings: newSettings,
        });
      }
    }
  }
</script>

{#if !timetable || !settings}
  <div class="min-h-screen flex items-center justify-center bg-slate-50">
    <div class="flex flex-col items-center space-y-3">
      <div class="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-sm font-semibold text-slate-600">스마트 교무실을 불러오는 중...</p>
    </div>
  </div>
{:else}
  <div class="min-h-screen flex flex-col bg-slate-50 text-slate-800">
    <!-- 1. 상단 글로벌 헤더 -->
    <Header
      schoolName={settings.schoolName}
      teacherName={settings.teacherName}
      firebaseConnected={firebaseConnected}
      activePage={activeTab}
      on:changePage={(e) => (activeTab = e.detail)}
      on:openSettings={() => (isSettingsOpen = true)}
      on:openTimetable={() => (isTimetableOpen = true)}
      on:runDemo={handleRunDemo}
      on:resetData={handleResetData}
    />

    <!-- 메인 작업 영역 -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <!-- 2. 전역 스크린샷 및 텍스트 복붙(Ctrl+V) & 파일 드롭존 -->
      <GlobalDropZone
        isProcessing={isProcessing}
        on:processInput={(e) => handleProcessInput(e.detail)}
        on:openTextInput={() => (isTextInputOpen = true)}
      />

      <!-- 3. 페이지 뷰 렌더링 (src/routes/TodayPage, src/routes/CalendarPage) -->
      {#if activeTab === 'today'}
        <TodayPage
          selectedDate={selectedDate}
          todos={todos}
          events={events}
          timetable={timetable}
          briefings={briefings}
          on:toggleTodo={(e) => handleToggleTodo(e.detail)}
          on:deleteTodo={(e) => handleDeleteTodo(e.detail)}
          on:addTodo={(e) => handleAddCustomTodo(e.detail.title, e.detail.tag)}
          on:toggleBriefing={(e) => handleToggleBriefing(e.detail)}
          on:addBriefing={(e) => handleAddBriefing(e.detail)}
          on:viewSource={(e) => handleViewSource(e.detail)}
          on:openTimetableModal={() => (isTimetableOpen = true)}
        />
      {:else if activeTab === 'calendar'}
        <CalendarPage
          events={events}
          selectedDate={selectedDate}
          on:selectDate={(e) => (selectedDate = e.detail)}
          on:viewSource={(e) => handleViewSource(e.detail)}
        />
      {/if}
    </main>

    <!-- 5. 모달 다이얼로그 모음 -->
    <!-- (0) 온보딩 초기 설정 마법사 (최초 실행 시에만) -->
    <OnboardingModal
      isOpen={isOnboardingOpen}
      settings={settings}
      on:complete={handleOnboardingComplete}
    />

    <!-- (1) AI 파싱 검토 및 교사 최종 확정 모달 -->
    <AIReviewModal
      isOpen={isReviewOpen}
      parsedResult={currentParsed}
      multiItems={multiParsed}
      sourceImage={currentSourceImage}
      sourceText={currentSourceText}
      fileName={currentFileName}
      on:close={() => (isReviewOpen = false)}
      on:confirmSingle={(e) => handleConfirmReview(e.detail)}
      on:confirmMulti={(e) => handleConfirmMulti(e.detail)}
    />

    <!-- (2) 텍스트 직접 복사/붙여넣기 모달 -->
    <TextInputModal
      isOpen={isTextInputOpen}
      on:close={() => (isTextInputOpen = false)}
      on:submitText={(e) => {
        handleProcessInput({
          type: 'text',
          data: e.detail,
          fileName: '직접_입력한_메신저_텍스트',
        });
      }}
    />

    <!-- (3) 공문/메신저 원본 뷰어 모달 -->
    <SourceViewerModal
      isOpen={isSourceOpen}
      data={sourceModalData}
      on:close={() => (isSourceOpen = false)}
    />

    <!-- (4) 주간 시간표 관리 모달 -->
    <TimetableModal
      isOpen={isTimetableOpen}
      timetable={timetable}
      on:close={() => (isTimetableOpen = false)}
      on:saveTimetable={(e) => handleSaveTimetable(e.detail)}
      on:uploadImage={(e) => {
        isTimetableOpen = false;
        handleProcessInput({
          type: 'image',
          data: e.detail.base64,
          fileName: '시간표_스크린샷.png',
          mimeType: e.detail.mimeType,
        });
      }}
    />

    <!-- (5) 환경 설정 모달 -->
    <SettingsModal
      isOpen={isSettingsOpen}
      settings={settings}
      on:close={() => (isSettingsOpen = false)}
      on:save={(e) => handleSaveSettings(e.detail)}
      on:resetData={handleResetData}
    />

    <!-- 6. 삭제 실행 취소(되살리기) 토스트 -->
    {#if undoToast}
      <div class="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-slate-700 animate-fade-in">
        <div class="p-1.5 bg-rose-500 rounded-lg">
          <Trash2 class="w-4 h-4 text-white" />
        </div>
        <div class="text-xs">
          <p class="font-bold">'{undoToast.title}' 항목이 삭제되었습니다.</p>
          <p class="text-slate-400">실수로 지우셨다면 되살릴 수 있습니다.</p>
        </div>
        <button
          type="button"
          on:click={handleUndoDelete}
          class="ml-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center space-x-1 transition active:scale-95 shadow-xs cursor-pointer"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>되살리기</span>
        </button>
      </div>
    {/if}
  </div>
{/if}
