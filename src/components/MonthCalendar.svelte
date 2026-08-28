<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    isToday as isTodayDate,
  } from 'date-fns';
  import { ko } from 'date-fns/locale';
  import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-svelte';
  import type { ScheduleEvent, EventCategory } from '../lib/types';

  export let events: ScheduleEvent[] = [];
  export let selectedDate: Date = new Date();

  const dispatch = createEventDispatcher<{
    selectDate: Date;
    viewSource: ScheduleEvent;
  }>();

  let currentMonth: Date = selectedDate;
  let prevSelectedDate: Date = selectedDate;

  // selectedDate가 외부(다른 컴포넌트)에서 바뀐 경우에만 currentMonth를 동기화한다.
  // currentMonth 자체의 변화(다음/이전 달 버튼)로 이 블록이 다시 실행되어도,
  // prevSelectedDate 가드 덕분에 방금 바꾼 달을 되돌리지 않는다.
  $: if (selectedDate && selectedDate !== prevSelectedDate) {
    prevSelectedDate = selectedDate;
    if (!isSameMonth(currentMonth, selectedDate)) {
      currentMonth = selectedDate;
    }
  }

  const CATEGORY_STYLES: Record<EventCategory, { bg: string; text: string; dot: string; label: string }> = {
    exam: { bg: 'bg-rose-50 border-rose-200 text-rose-700', text: 'text-rose-700', dot: 'bg-rose-500', label: '평가/출제' },
    document: { bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', text: 'text-indigo-700', dot: 'bg-indigo-500', label: '공문/기안' },
    student: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', text: 'text-emerald-700', dot: 'bg-emerald-500', label: '학생/상담' },
    meeting: { bg: 'bg-amber-50 border-amber-200 text-amber-700', text: 'text-amber-700', dot: 'bg-amber-500', label: '회의/연수' },
    event: { bg: 'bg-purple-50 border-purple-200 text-purple-700', text: 'text-purple-700', dot: 'bg-purple-500', label: '교내행사' },
    general: { bg: 'bg-slate-100 border-slate-200 text-slate-700', text: 'text-slate-700', dot: 'bg-slate-500', label: '일반' },
  };

  function prevMonth() {
    currentMonth = subMonths(currentMonth, 1);
  }

  function nextMonth() {
    currentMonth = addMonths(currentMonth, 1);
  }

  function goToToday() {
    const today = new Date();
    currentMonth = today;
    dispatch('selectDate', today);
  }

  $: monthStart = startOfMonth(currentMonth);
  $: monthEnd = endOfMonth(monthStart);
  $: startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // 일요일 시작
  $: endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
  $: days = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDayNames = ['일', '월', '화', '수', '목', '금', '토'];

  function getEventsForDay(day: Date): ScheduleEvent[] {
    const dayStr = format(day, 'yyyy-MM-dd');
    return events.filter((e) => e && e.date === dayStr);
  }
</script>

<div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-full">
  <!-- 캘린더 상단 네비게이션 헤더 -->
  <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
    <div class="flex items-center space-x-3">
      <h2 class="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
        <CalendarIcon class="w-5 h-5 text-blue-600" />
        <span>{format(currentMonth, 'yyyy년 M월', { locale: ko })}</span>
      </h2>
      <button
        type="button"
        on:click={goToToday}
        class="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition cursor-pointer"
      >
        오늘
      </button>
    </div>

    <div class="flex items-center space-x-1">
      <button
        type="button"
        on:click={prevMonth}
        class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
        title="이전 달"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <button
        type="button"
        on:click={nextMonth}
        class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
        title="다음 달"
      >
        <ChevronRight class="w-5 h-5" />
      </button>
    </div>
  </div>

  <!-- 요일 헤더 -->
  <div class="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70 text-center py-2 text-xs font-bold text-slate-500">
    {#each weekDayNames as dayName, idx}
      <div class={idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : ''}>
        {dayName}
      </div>
    {/each}
  </div>

  <!-- 날짜 그리드 -->
  <div class="grid grid-cols-7 auto-rows-fr flex-1 bg-slate-100 gap-[1px]">
    {#each days as day}
      {@const isCurrentMonth = isSameMonth(day, currentMonth)}
      {@const isSelected = isSameDay(day, selectedDate)}
      {@const isTodayDay = isTodayDate(day)}
      {@const dayEvents = getEventsForDay(day)}

      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        on:click={() => dispatch('selectDate', day)}
        class={`min-h-[100px] p-2 flex flex-col justify-between transition cursor-pointer ${
          isCurrentMonth ? 'bg-white' : 'bg-slate-50/70 text-slate-400'
        } ${isSelected ? 'ring-2 ring-blue-500 ring-inset z-10 bg-blue-50/20' : 'hover:bg-slate-50/80'}`}
      >
        <!-- 날짜 숫자 -->
        <div class="flex items-center justify-between mb-1">
          <span
            class={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
              isTodayDay
                ? 'bg-blue-600 text-white'
                : isSelected
                ? 'bg-blue-100 text-blue-700'
                : isCurrentMonth
                ? 'text-slate-700'
                : 'text-slate-400'
            }`}
          >
            {format(day, 'd')}
          </span>

          {#if dayEvents.length > 0}
            <span class="text-[10px] font-bold text-slate-400">
              {dayEvents.length}건
            </span>
          {/if}
        </div>

        <!-- 해당 날짜의 마감 일정 배지 목록 -->
        <div class="space-y-1 flex-1 overflow-hidden">
          {#each dayEvents.slice(0, 3) as event}
            {@const style = CATEGORY_STYLES[event.category] || CATEGORY_STYLES.general}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              on:click|stopPropagation={() => dispatch('viewSource', event)}
              class={`px-1.5 py-0.5 rounded text-[11px] font-medium border truncate flex items-center space-x-1 cursor-pointer hover:opacity-85 ${style.bg}`}
              title={`${event.title} (클릭 시 원본 공문 확인)`}
            >
              <span class={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`}></span>
              <span class="truncate">{event.title}</span>
            </div>
          {/each}

          {#if dayEvents.length > 3}
            <div class="text-[10px] text-slate-400 font-semibold pl-1">
              +{dayEvents.length - 3}건 더보기
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- 범례 (Footer) -->
  <div class="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
    <div class="flex items-center space-x-3">
      <span class="font-bold text-slate-700">구분:</span>
      <span class="flex items-center space-x-1"><span class="w-2 h-2 rounded-full bg-rose-500"></span><span>평가/출제</span></span>
      <span class="flex items-center space-x-1"><span class="w-2 h-2 rounded-full bg-indigo-500"></span><span>공문/기안</span></span>
      <span class="flex items-center space-x-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>학생/상담</span></span>
      <span class="flex items-center space-x-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span><span>회의/연수</span></span>
      <span class="flex items-center space-x-1"><span class="w-2 h-2 rounded-full bg-purple-500"></span><span>교내행사</span></span>
    </div>
    <span class="text-[11px] text-slate-400">일정을 클릭하면 던져넣었던 공문/메신저 원본을 바로 확인하실 수 있습니다.</span>
  </div>
</div>
