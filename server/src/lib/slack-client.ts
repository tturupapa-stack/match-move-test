import { log } from './logger.js';

export interface SlackChangeRequestPayload {
  targetId: number;
  managerName: string;
  managerId: number;
  current: { stadium: string; scheduleKst: string; participants: number };
  selected: {
    matchId: number;
    stadium: string;
    scheduleKst: string;
    participants: number;
    isTransferOrigin: boolean;
    testType: number | null;
  };
}

export interface SlackKeepPayload {
  targetId: number;
  managerName: string;
  managerId: number;
  current: { stadium: string; scheduleKst: string; participants: number };
}

export interface SlackExtractSummaryPayload {
  targetSchedule: string; // 대상 매치 시각 'YYYY-MM-DD HH:mm:ss' (KST)
  inserted: number; // 신규 발송 대기 추가 건수
  rawCandidates: number; // Q1 후보 수
  afterRecommendationFilter: number; // 추천 매치 있는 대상 수
  exportUrl: string; // 발송 관리 화면 URL
}

export interface SlackClient {
  postChangeRequest(p: SlackChangeRequestPayload): Promise<void>;
  postKeep(p: SlackKeepPayload): Promise<void>;
  postExtractSummary(p: SlackExtractSummaryPayload): Promise<void>;
}

export class WebhookSlackClient implements SlackClient {
  constructor(
    private readonly opts: { webhookUrl: string; channel: string; fetchImpl?: typeof fetch },
  ) {}

  private async postRaw(text: string): Promise<void> {
    if (!this.opts.webhookUrl) {
      log.info('slack dry-run (no webhook)', { text });
      return;
    }
    const fetchImpl = this.opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
    const res = await fetchImpl(this.opts.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: this.opts.channel, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.error('slack post failed', { status: res.status, body });
      throw new Error(`Slack post failed: ${res.status} ${body}`);
    }
  }

  async postChangeRequest(p: SlackChangeRequestPayload): Promise<void> {
    const promotionLabel =
      p.selected.testType !== null && [3, 6, 7, 8, 9].includes(p.selected.testType)
        ? String(p.selected.testType)
        : 'NONE';
    const text =
      `:bell: 매치 이동 요청 / ${new Date().toISOString()} #target-${p.targetId}\n\n` +
      `매니저: ${p.managerName} (ID: ${p.managerId})\n` +
      `현재 매치: ${p.current.stadium} / ${p.current.scheduleKst} / 참가자 ${p.current.participants}명\n` +
      `요청 매치: ${p.selected.stadium} / ${p.selected.scheduleKst} / 참가자 ${p.selected.participants}명 (match_id=${p.selected.matchId})\n` +
      `양도 매물 여부: ${p.selected.isTransferOrigin ? 'YES' : 'NO'}\n` +
      `프로모션 매치 여부: ${promotionLabel}\n` +
      `→ 변경 페이지: https://www.plabfootball.com/e-to-play/match/match/${p.selected.matchId}/change/\n\n` +
      `→ 처리 완료 시 이 메시지에 :white_check_mark: 이모지로 마킹`;
    await this.postRaw(text);
  }

  async postKeep(p: SlackKeepPayload): Promise<void> {
    const text =
      `:information_source: 매니저 유지 선택 / ${new Date().toISOString()} #target-${p.targetId}\n\n` +
      `매니저: ${p.managerName} (ID: ${p.managerId})\n` +
      `현재 매치: ${p.current.stadium} / ${p.current.scheduleKst} / 참가자 ${p.current.participants}명\n` +
      `(운영자 처리 불필요)`;
    await this.postRaw(text);
  }

  async postExtractSummary(p: SlackExtractSummaryPayload): Promise<void> {
    const ts = new Date().toISOString();
    const text =
      p.inserted > 0
        ? `:mega: 매치 이동 대상자 추출 / ${ts}\n\n` +
          `대상 매치 시각(KST): ${p.targetSchedule}\n` +
          `신규 발송 대기: ${p.inserted}건 (Q1 후보 ${p.rawCandidates}건)\n\n` +
          `→ 발송 관리 화면에서 채널톡 발송 처리: ${p.exportUrl}`
        : `:mailbox_with_no_mail: 매치 이동 추출 결과 / ${ts}\n\n` +
          `대상 매치 시각(KST): ${p.targetSchedule}\n` +
          `발송 대상 없음 (Q1 후보 ${p.rawCandidates}건, 추천 매치 있는 대상 ${p.afterRecommendationFilter}건)`;
    await this.postRaw(text);
  }
}

export function createSlackClient(env: { SLACK_WEBHOOK_URL: string; SLACK_CHANNEL: string }): SlackClient {
  return new WebhookSlackClient({ webhookUrl: env.SLACK_WEBHOOK_URL, channel: env.SLACK_CHANNEL });
}
