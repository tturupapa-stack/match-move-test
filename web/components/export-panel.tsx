'use client';

import { useState } from 'react';
import { clientFetch } from '../lib/api';
import type { RecommendedMatch } from '@shared/api';

export interface PendingItem {
  targetId: number;
  managerName: string | null;
  phone: string;
  matchTime: string | null;
  stadiumName: string | null;
  exportCount: number;
  messageText: string;
  recommended: RecommendedMatch[]; // 관리자 전용: 추천받은 매치 + 양도/프로모션 여부
}
export interface PendingData {
  count: number;
  items: PendingItem[];
}

function CopyButton({
  text,
  label,
  disabled,
}: {
  text: string;
  label: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API 미지원 환경 fallback
      window.prompt('복사할 내용을 직접 선택하세요', text);
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={disabled}
      className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-brandSoft disabled:opacity-40"
    >
      {copied ? '복사됨 ✓' : label}
    </button>
  );
}

export function ExportPanel({ initial }: { initial: PendingData }) {
  const [data, setData] = useState<PendingData>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    const r = await clientFetch<PendingData>('/api/admin/export/pending');
    if (r.ok) setData(r.data);
  };

  const mark = async (targetIds: number[]) => {
    if (targetIds.length === 0) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await clientFetch<{ marked: number; requested: number }>('/api/admin/export/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetIds, markedBy: 'admin-ui' }),
    });
    setBusy(false);
    if (r.ok) {
      setMsg(`${r.data.marked}건을 발송 완료로 처리했습니다.`);
      await refresh();
    } else {
      setErr(r.error.message);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">발송 대기</h2>
          <span className="rounded-full bg-brandSoft px-3 py-1 text-sm font-medium tabular-nums">
            {data.count} 건
          </span>
        </div>
        <ol className="mt-4 space-y-1.5 text-sm text-muted">
          <li>1. 카드의 <b>번호 복사</b>로 채널톡에서 대상 매니저를 찾습니다.</li>
          <li>2. <b>메시지 복사</b>로 안내 메시지를 대화창에 붙여넣어 발송합니다.</li>
          <li>3. 발송한 카드의 <b>발송 완료</b>를 누릅니다 (지표 반영).</li>
          <li>※ 매치 시작 <b>1시간 30분 전</b>까지 발송해야 매니저가 액션할 수 있습니다.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => mark(data.items.map((i) => i.targetId))}
            disabled={busy || data.count === 0}
            className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy ? '처리 중…' : '전체 발송 완료 처리'}
          </button>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center rounded-lg border border-line px-4 py-2 text-sm text-muted"
          >
            새로고침
          </button>
        </div>
        {msg && <p className="mt-3 text-sm text-brand">{msg}</p>}
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      </section>

      {data.items.length === 0 ? (
        <section className="rounded-xl border border-line bg-white p-6">
          <p className="text-sm text-muted">발송 대기 중인 대상이 없습니다.</p>
        </section>
      ) : (
        <ul className="space-y-4">
          {data.items.map((it) => (
            <li key={it.targetId} className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{it.managerName ?? `대상 #${it.targetId}`}</span>
                  {it.phone ? (
                    <span className="ml-2 text-sm tabular-nums text-muted">{it.phone}</span>
                  ) : (
                    <span className="ml-2 text-sm text-danger">번호 조회 실패</span>
                  )}
                  {it.exportCount > 0 && (
                    <span className="ml-2 rounded bg-brandSoft px-1.5 py-0.5 text-xs text-muted">
                      재발송 {it.exportCount}
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted">
                  {it.matchTime} · {it.stadiumName}
                </div>
              </div>

              <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-sm leading-relaxed">
                {it.messageText}
              </pre>

              {it.recommended.length > 0 && (
                <div className="mt-3 rounded-lg bg-surface p-3 text-sm">
                  <div className="mb-1 text-xs font-medium text-muted">
                    추천받은 매치 {it.recommended.length}개 (관리자 전용)
                  </div>
                  <ul className="space-y-1">
                    {it.recommended.map((r) => (
                      <li key={r.matchId} className="flex items-center justify-between gap-2">
                        <span>
                          {r.scheduleKst} · {r.stadiumName} (참가자 {r.participantCount})
                        </span>
                        <span className="flex shrink-0 gap-1">
                          {r.isTransferOrigin && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">양도</span>
                          )}
                          {r.isPromotion && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs">프로모션</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={it.phone} label="번호 복사" disabled={!it.phone} />
                <CopyButton text={it.messageText} label="메시지 복사" />
                <button
                  type="button"
                  onClick={() => mark([it.targetId])}
                  disabled={busy}
                  className="inline-flex items-center rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  발송 완료
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
