'use client';

import { useState } from 'react';
import { clientFetch, type MatchMoveActionResult } from '../lib/api';
import { CurrentMatchCard, RecommendedMatchCard } from './match-card';
import { StatusBanner } from './status-banner';
import type { CurrentMatchPublic, RecommendedMatchPublic } from '@shared/api';

type ResultStatus = MatchMoveActionResult['status'];

export function ActionView({
  token,
  current,
  recommendations,
}: {
  token: string;
  current: CurrentMatchPublic;
  recommendations: RecommendedMatchPublic[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [result, setResult] = useState<ResultStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (result === 'accepted') {
    return <StatusBanner tone="success">접수되었습니다. 감사합니다.</StatusBanner>;
  }
  if (result === 'already_actioned') {
    return <StatusBanner tone="info">이미 응답이 접수되었습니다.</StatusBanner>;
  }
  if (result === 'deadline_passed') {
    return <StatusBanner tone="warning">변경 가능 시간이 종료되었습니다.</StatusBanner>;
  }
  if (result === 'invalid_selection') {
    return <StatusBanner tone="danger">선택하신 매치를 처리할 수 없습니다. 다시 시도해주세요.</StatusBanner>;
  }
  if (result === 'match_closed') {
    return (
      <StatusBanner tone="warning">
        선택하신 매치가 마감되었습니다. 다른 매니저가 먼저 가져가 더 이상 이동할 수 없어요.
      </StatusBanner>
    );
  }
  if (result === 'invalid_token') {
    return <StatusBanner tone="danger">잘못된 접근입니다.</StatusBanner>;
  }

  const submit = async (body: { action: 'select' | 'keep'; selectedMatchId?: number }) => {
    setSubmitting(true);
    try {
      const r = await clientFetch<MatchMoveActionResult>('/api/match-move/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          ...body,
        }),
      });
      if (r.ok) setResult(r.data.status);
      else setResult('invalid_token');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <CurrentMatchCard m={current} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted">추천 매치 ({recommendations.length})</h2>
        <div className="space-y-3">
          {recommendations.map((m) => (
            <RecommendedMatchCard
              key={m.matchId}
              m={m}
              selected={selectedId === m.matchId}
              onSelect={() => setSelectedId(m.matchId)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={selectedId === null || submitting}
          onClick={() => void submit({ action: 'select', selectedMatchId: selectedId! })}
          className="w-full rounded-xl bg-brand px-4 py-3 text-white font-semibold disabled:opacity-50"
        >
          선택한 매치로 이동 요청
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit({ action: 'keep' })}
          className="w-full rounded-xl border border-line bg-white px-4 py-3 font-semibold text-ink disabled:opacity-50"
        >
          현재 매치 유지
        </button>
      </div>
    </div>
  );
}

export function KeepOnlyView({ token, current }: { token: string; current: CurrentMatchPublic }) {
  const [result, setResult] = useState<ResultStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (result === 'accepted') {
    return <StatusBanner tone="success">접수되었습니다. 감사합니다.</StatusBanner>;
  }
  if (result) {
    return <StatusBanner tone="info">처리 결과: {result}</StatusBanner>;
  }
  return (
    <div className="space-y-4">
      <CurrentMatchCard m={current} />
      <StatusBanner tone="warning">현재 추천 가능한 매치가 없습니다.</StatusBanner>
      <button
        type="button"
        disabled={submitting}
        onClick={async () => {
          setSubmitting(true);
          const r = await clientFetch<MatchMoveActionResult>('/api/match-move/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, action: 'keep' }),
          });
          setSubmitting(false);
          if (r.ok) setResult(r.data.status);
        }}
        className="w-full rounded-xl bg-brand px-4 py-3 text-white font-semibold disabled:opacity-50"
      >
        현재 매치 유지로 응답하기
      </button>
    </div>
  );
}
