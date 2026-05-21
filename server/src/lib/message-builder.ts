// PRD §2.4 안내 메시지 본문 빌더. 채널톡 복붙용 메시지의 본문 부분을 생성한다 (ADR-013).
// 추천 페이지 URL은 호출 측(admin-export)에서 본문 뒤에 덧붙인다.

export interface MessageVars {
  managerName: string;
  matchTime: string; // 'YYYY-MM-DD HH:mm' KST 표시 문자열
  stadiumName: string;
  participantCount: number;
}

export function buildMessageBody(v: MessageVars): string {
  return [
    `[${v.managerName}] 안녕하세요.`,
    `${v.matchTime} ${v.stadiumName} 매치는 현재 참가자가 ${v.participantCount}명으로 진행 가능성이 낮습니다.`,
    '',
    '근처에 진행 가능성이 높은 다른 매치로 이동하실 수 있습니다.',
    '아래 버튼을 눌러 추천 매치를 확인해주세요.',
    '',
    '※ 변경 가능 시간: 매치 시작 1시간 30분 전까지',
  ].join('\n');
}
