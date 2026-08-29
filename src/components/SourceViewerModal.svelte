<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, FileText, Download, Calendar, FileCode, Info } from 'lucide-svelte';

  export let isOpen: boolean = false;
  export let data: {
    title: string;
    sourceImage?: string;
    sourceText?: string;
    date?: string;
    fileName?: string;
    category?: string;
  } | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  $: fileNameLower = (data?.fileName || '').toLowerCase();
  $: isPdf = fileNameLower.endsWith('.pdf') || (data?.sourceImage && data.sourceImage.startsWith('data:application/pdf'));
  $: isHwp = fileNameLower.endsWith('.hwp') || fileNameLower.endsWith('.hwpx');
  $: isImage = data?.sourceImage && (data.sourceImage.startsWith('data:image/') || (!isPdf && !isHwp));

  function handleDownload() {
    if (!data) return;
    const targetUrl = data.sourceImage;
    if (!targetUrl) {
      if (data.sourceText) {
        const blob = new Blob([data.sourceText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.fileName || `${data.title}_원본공문.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      return;
    }

    // DataURL base64인 경우 바이너리 Blob으로 안전하게 변환하여 다운로드
    if (targetUrl.startsWith('data:')) {
      try {
        const parts = targetUrl.split(';base64,');
        if (parts.length === 2) {
          const contentType = parts[0].replace('data:', '');
          const binaryStr = window.atob(parts[1]);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' });
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = data.fileName || `${data.title}.${isPdf ? 'pdf' : isHwp ? 'hwp' : 'png'}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
          return;
        }
      } catch (e) {
        console.error('Base64 decode error, fallback to direct download', e);
      }
    }

    const link = document.createElement('a');
    link.href = targetUrl;
    link.download = data.fileName || `${data.title}.${isPdf ? 'pdf' : isHwp ? 'hwp' : 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
</script>

{#if isOpen && data}
  <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
    <div class="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
      <!-- 상단 헤더 -->
      <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
        <div class="flex items-center space-x-2.5 truncate">
          <div class={`p-2 rounded-xl border ${
            isHwp
              ? 'bg-blue-500/30 border-blue-400/50 text-blue-300'
              : isPdf
              ? 'bg-rose-500/30 border-rose-400/50 text-rose-300'
              : 'bg-emerald-500/30 border-emerald-400/50 text-emerald-300'
          }`}>
            {#if isHwp}
              <FileCode class="w-5 h-5" />
            {:else}
              <FileText class="w-5 h-5" />
            {/if}
          </div>
          <div class="truncate">
            <div class="flex items-center space-x-2">
              <h2 class="text-sm sm:text-base font-bold truncate">
                {data.title}
              </h2>
              {#if isHwp}
                <span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500 text-white">
                  한글(HWP) 공문
                </span>
              {/if}
              {#if isPdf}
                <span class="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500 text-white">
                  PDF 문서
                </span>
              {/if}
            </div>
            <p class="text-xs text-slate-400 truncate mt-0.5">
              {data.fileName ? `첨부 파일: ${data.fileName}` : '등록 당시 던져넣었던 공문/메신저 원본 기록'}
            </p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          {#if data.sourceImage || data.sourceText}
            <button
              type="button"
              on:click={handleDownload}
              class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition flex items-center space-x-1 cursor-pointer"
              title="원본 파일 다운로드"
            >
              <Download class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">다운로드</span>
            </button>
          {/if}
          <button
            type="button"
            on:click={() => dispatch('close')}
            class="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- 본문 -->
      <div class="p-6 overflow-y-auto flex-1 bg-slate-50 flex flex-col items-center justify-center">
        <!-- 1. 한글 파일인 경우 -->
        {#if isHwp}
          <div class="w-full max-w-2xl bg-white p-6 sm:p-8 rounded-2xl border border-blue-200 shadow-md space-y-5">
            <div class="flex items-center space-x-4 p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 rounded-xl border border-blue-100">
              <div class="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-xs flex-shrink-0">
                HWP
              </div>
              <div class="truncate flex-1">
                <h3 class="font-bold text-slate-800 text-sm sm:text-base truncate">
                  {data.fileName || `${data.title}.hwp`}
                </h3>
                <p class="text-xs text-blue-600 font-medium mt-0.5">
                  한글 워드프로세서 공문서 파일
                </p>
              </div>
              {#if data.sourceImage}
                <button
                  type="button"
                  on:click={handleDownload}
                  class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1 flex-shrink-0 shadow-xs cursor-pointer"
                >
                  <Download class="w-3.5 h-3.5" />
                  <span>파일 받기</span>
                </button>
              {/if}
            </div>

            <div class="border-t border-slate-200 pt-4 space-y-3">
              <div class="flex items-center space-x-1.5 text-xs font-bold text-slate-700">
                <FileText class="w-4 h-4 text-blue-600" />
                <span>공문서 본문 및 핵심 지시사항</span>
              </div>

              <div class="bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs text-slate-800 leading-relaxed max-h-64 overflow-y-auto">
                {#if data.sourceText}
                  {@html data.sourceText}
                {:else}
                  <p class="whitespace-pre-wrap font-mono">[공문명]: {data.title}{'\n'}[마감일자]: {data.date || '계획서 명시일'}{'\n\n'}* 본 문서는 교직원 한글 파일로 첨부되어 등록되었습니다.{'\n'}* 세부 계획서 원본을 확인하시려면 우측 상단 [다운로드] 버튼을 누르시면 PC에 바로 저장됩니다.</p>
                {/if}
              </div>
            </div>
          </div>
        {:else if isPdf}
          <!-- 2. PDF 파일인 경우 -->
          <iframe
            src={data.sourceImage}
            title={data.title}
            class="w-full h-[65vh] rounded-xl border border-slate-300 shadow-md bg-white"
          />
        {:else if isImage && data.sourceImage}
          <!-- 3. 이미지인 경우 -->
          <div class="max-w-full rounded-xl overflow-hidden shadow-lg border border-slate-300 bg-white">
            <img
              src={data.sourceImage}
              alt={data.title}
              class="w-auto max-h-[65vh] object-contain mx-auto"
            />
          </div>
        {:else if data.sourceText}
          <!-- 4. 텍스트 전문인 경우 -->
          <div class="w-full max-w-2xl bg-white p-6 rounded-2xl border border-slate-200 shadow-xs max-h-[60vh] overflow-y-auto">
            <pre class="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
              {data.sourceText}
            </pre>
          </div>
        {:else}
          <!-- 5. 데이터가 없는 경우 -->
          <div class="w-full max-w-md bg-white p-6 rounded-2xl border border-slate-200 text-center space-y-3">
            <Info class="w-8 h-8 text-blue-500 mx-auto" />
            <h4 class="text-sm font-bold text-slate-800">{data.title}</h4>
            <p class="text-xs text-slate-500">
              {data.fileName ? `첨부 파일: ${data.fileName}` : '본 일정은 텍스트/공문 분석을 통해 등록되었습니다.'}
            </p>
          </div>
        {/if}
      </div>

      <!-- 하단 메타정보 -->
      <div class="px-6 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2 flex-shrink-0">
        <div class="flex items-center space-x-3">
          {#if data.date}
            <span class="flex items-center space-x-1">
              <Calendar class="w-3.5 h-3.5 text-slate-400" />
              <span>마감일: {data.date}</span>
            </span>
          {/if}
          {#if data.fileName}
            <span class="text-slate-500 font-medium truncate max-w-xs">
              파일명: {data.fileName}
            </span>
          {/if}
        </div>

        <span class="text-[11px] text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full">
          💡 공문이나 메신저를 다시 검색할 필요 없이 언제든 원본을 확인하세요.
        </span>
      </div>
    </div>
  </div>
{/if}
