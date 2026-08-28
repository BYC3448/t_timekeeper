<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, User, Shield, RotateCcw, Check, Sparkles } from 'lucide-svelte';
  import type { AppSettings } from '../lib/storage';

  export let isOpen: boolean = false;
  export let settings: AppSettings | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    save: AppSettings;
    resetData: void;
  }>();

  let autoMask = true;
  let schoolName = '새솔고등학교';
  let teacherName = '김선생님';
  let homeroomClass = '3학년 2반';
  let department = '진로진학부, 과학과 교과주임';
  let subjects = '2학년 물리학Ⅰ, 3학년 생활과 과학';
  let extraDuties = '수능 응시원서 접수 총괄, 과학교구 예산 추경 관리';

  let savedToast = false;

  $: if (isOpen && settings) {
    autoMask = settings.autoMaskPersonalInfo ?? true;
    schoolName = settings.schoolName || '새솔고등학교';
    teacherName = settings.teacherName || '김선생님';
    homeroomClass = settings.profile?.homeroomClass || '3학년 2반';
    department = settings.profile?.department || '진로진학부, 과학과 교과주임';
    subjects = settings.profile?.subjects || '2학년 물리학Ⅰ, 3학년 생활과 과학';
    extraDuties = settings.profile?.extraDuties || '수능 응시원서 접수 총괄, 과학교구 예산 추경 관리';
  }

  function handleSave() {
    dispatch('save', {
      autoMaskPersonalInfo: autoMask,
      schoolName: schoolName.trim(),
      teacherName: teacherName.trim(),
      profile: {
        schoolName: schoolName.trim(),
        teacherName: teacherName.trim(),
        isHomeroom: !!homeroomClass && !homeroomClass.includes('아님'),
        homeroomClass: homeroomClass.trim(),
        department: department.trim(),
        position: department.trim(),
        subjects: subjects.trim(),
        extraDuties: extraDuties.trim(),
      },
      firebaseConfig: settings?.firebaseConfig,
    });

    savedToast = true;
    setTimeout(() => {
      savedToast = false;
      dispatch('close');
    }, 600);
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
    <div class="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
      <!-- 상단 헤더 -->
      <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
        <div class="flex items-center space-x-2.5">
          <div class="p-2 bg-blue-600/30 rounded-xl">
            <User class="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 class="text-base font-bold">교사 프로필 & 환경 설정</h2>
            <p class="text-xs text-slate-400">AI 맞춤형 공문 분석 기준 및 기본 정보</p>
          </div>
        </div>
        <button
          type="button"
          on:click={() => dispatch('close')}
          class="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 본문 -->
      <div class="p-6 overflow-y-auto flex-1 space-y-5">
        <div class="p-3.5 bg-blue-50/70 rounded-2xl border border-blue-100 text-xs text-blue-950 flex items-start space-x-2">
          <Sparkles class="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p class="leading-relaxed">
            AI가 공문이나 메신저를 분석할 때 아래 <strong>담당 학년, 학급, 과목, 부서</strong>를 기준으로 타 부서 업무를 걸러내고 <strong>"내 일(isMine)"</strong>을 정확히 판별합니다.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label for="teacher-school-name" class="text-xs font-bold text-slate-700 block mb-1">소속 학교</label>
            <input
              id="teacher-school-name"
              type="text"
              bind:value={schoolName}
              placeholder="예: 새솔고등학교"
              class="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label for="teacher-name-input" class="text-xs font-bold text-slate-700 block mb-1">교사 성명</label>
            <input
              id="teacher-name-input"
              type="text"
              bind:value={teacherName}
              placeholder="예: 김선생님"
              class="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label for="teacher-homeroom" class="text-xs font-bold text-slate-700 block mb-1">담임 학급 (비담임은 '비담임')</label>
            <input
              id="teacher-homeroom"
              type="text"
              bind:value={homeroomClass}
              placeholder="예: 3학년 2반"
              class="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label for="teacher-dept" class="text-xs font-bold text-slate-700 block mb-1">소속 부서 / 직책</label>
            <input
              id="teacher-dept"
              type="text"
              bind:value={department}
              placeholder="예: 진로진학부, 과학과 교과주임"
              class="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label for="teacher-subjects" class="text-xs font-bold text-slate-700 block mb-1">담당 교과목</label>
          <input
            id="teacher-subjects"
            type="text"
            bind:value={subjects}
            placeholder="예: 2학년 물리학Ⅰ, 3학년 생활과 과학"
            class="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div>
          <label for="teacher-extra" class="text-xs font-bold text-slate-700 block mb-1">주요 담당 분장 업무</label>
          <input
            id="teacher-extra"
            type="text"
            bind:value={extraDuties}
            placeholder="예: 수능 응시원서 접수 총괄, 과학교구 예산 추경 관리"
            class="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
          />
        </div>

        <!-- 개인정보 자동 마스킹 옵션 -->
        <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-start space-x-3">
          <input
            id="mask-checkbox"
            type="checkbox"
            bind:checked={autoMask}
            class="mt-0.5 w-4 h-4 text-blue-600 rounded cursor-pointer"
          />
          <div>
            <label for="mask-checkbox" class="text-xs font-bold text-slate-800 cursor-pointer flex items-center space-x-1.5">
              <Shield class="w-3.5 h-3.5 text-emerald-600" />
              <span>학생/학부모 개인정보 자동 마스킹 활성화</span>
            </label>
            <p class="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              AI 분석 전 전화번호, 주민등록번호 등을 자동으로 <code class="text-blue-600 font-mono">010-****-1234</code> 형태로 가려 안전하게 전송합니다.
            </p>
          </div>
        </div>
      </div>

      <!-- 하단 액션 바 -->
      <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
        <button
          type="button"
          on:click={() => {
            if (confirm('모든 일정 및 시간표 데이터를 초기 예시 상태로 복구할까요?')) {
              dispatch('resetData');
            }
          }}
          class="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition flex items-center space-x-1 cursor-pointer"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>데이터 초기화</span>
        </button>

        <div class="flex items-center space-x-2">
          {#if savedToast}
            <span class="text-xs text-emerald-600 font-bold flex items-center space-x-1">
              <Check class="w-4 h-4" />
              <span>저장되었습니다!</span>
            </span>
          {/if}
          <button
            type="button"
            on:click={handleSave}
            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
          >
            <Check class="w-4 h-4" />
            <span>설정 저장</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
