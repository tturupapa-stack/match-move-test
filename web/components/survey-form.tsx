'use client';

// 매니저가 추천 페이지에서 액션(이동요청/유지)을 완료한 직후 노출되는 후속 설문.
// 액션 유형에 따라 다른 사유 보기를 보여주며, 복수 선택 + '기타' 자유 입력 + 의견란을 받는다.
// 제출 결과는 server의 /api/match-move/survey 로 POST.
import { useState } from 'react';
import { clientFetch, type SurveyActionType, type SurveySubmitResult } from '../lib/api';
import { StatusBanner } from './status-banner';

type Reason = { value: string; label: string };

const KEEP_REASONS: Reason[] = [
  { value: 'few_options', label: '추천된 매치의 선택지가 적어서' },
  { value: 'location_mismatch', label: '추천된 매치의 장소 조건이 맞지 않아서' },
  { value: 'current_match_likely', label: '기존에 보유하고 있던 매치가 진행될 수 있을 것 같아서' },
  { value: 'current_match_benefit', label: '기존 보유하고 있던 매치의 혜택을 받고 싶어서' },
  { value: 'other', label: '기타 (직접 입력)' },
];

const SELECT_REASONS: Reason[] = [
  { value: 'high_likelihood', label: '이동 가능한 매치의 진행 가능성이 높아 보여서' },
  { value: 'location_ok', label: '장소가 비슷하거나 크게 불편하지 않아서' },
  { value: 'same_time', label: '시간이 동일해서' },
  { value: 'other', label: '기타 (직접 입력)' },
];

export function SurveyForm({
  token,
  actionType,
}: {
  token: string;
  actionType: SurveyActionType;
}) {
  const reasons = actionType === 'keep' ? KEEP_REASONS : SELECT_REASONS;
  const q1 =
    actionType === 'keep'
      ? '이동하지 않으신 이유가 무엇인가요? (복수 선택 가능)'
      : '이동하신 이유가 무엇인가요? (복수 선택 가능)';

  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<SurveySubmitResult['status'] | null>(null);

  if (status === 'accepted') {
    return (
      <StatusBanner tone="success">
        설문이 제출되었습니다. 소중한 의견 감사합니다.
      </StatusBanner>
    );
  }
  if (status === 'already_submitted') {
    return <StatusBanner tone="info">이미 설문에 응답해주셨습니다. 감사합니다.</StatusBanner>;
  }

  const toggle = (value: string) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const showOther = selected.includes('other');
  const canSubmit =
    selected.length > 0 && (!showOther || otherText.trim().length > 0) && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      const r = await clientFetch<SurveySubmitResult>('/api/match-move/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          actionType,
          reasons: selected,
          otherText: showOther ? otherText.trim() : undefined,
          suggestion: suggestion.trim() || undefined,
        }),
      });
      if (r.ok) setStatus(r.data.status);
      else setStatus('invalid_token');
    } finally {
      setSubmitting(false);
    }
  };

  // 액션은 정상 접수됐고, 설문은 추가 의견 수집 단계임을 명시.
  return (
    <div className="space-y-6">
      <StatusBanner tone="success">
        응답이 접수되었습니다. 잠시 시간을 내어 의견을 들려주실 수 있을까요?
      </StatusBanner>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink">{q1}</h2>
        <ul className="space-y-2">
          {reasons.map((r) => {
            const checked = selected.includes(r.value);
            return (
              <li key={r.value}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                    checked
                      ? 'border-brand bg-brandSoft text-ink'
                      : 'border-line bg-white text-ink hover:border-brand/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-brand"
                    checked={checked}
                    onChange={() => toggle(r.value)}
                  />
                  <span>{r.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {showOther ? (
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="기타 사유를 입력해주세요"
            maxLength={500}
            className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-brand"
          />
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink">
          관련하여 기타 제안 사항이 있다면?
        </h2>
        <textarea
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          placeholder="자유롭게 작성해주세요 (선택)"
          maxLength={2000}
          rows={4}
          className="w-full resize-none rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-brand"
        />
      </section>

      {/* 'accepted' / 'already_submitted'는 early return으로 처리됨 — 나머지만 표시. */}
      {status ? (
        <StatusBanner tone="danger">
          제출에 실패했습니다. 잠시 후 다시 시도해주세요. ({status})
        </StatusBanner>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => void submit()}
        className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? '제출 중…' : '제출하기'}
      </button>
    </div>
  );
}
