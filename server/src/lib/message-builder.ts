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
    `안녕하세요, ${v.managerName} 매니저님!`,
    "플랩은 참가 신청률이 낮은 매치에 배정된 매니저님들께 더 많은 매치 진행 기회를 드리기 위해 '진행 가능성이 높은 매치로 변경하는 기능'을 준비하고 있어요. 매니저님께서 해당 기능의 베타 테스트 대상자로 선정되어 안내드립니다 😊",
    '',
    `${v.matchTime} ${v.stadiumName} 매치`,
    `보유하신 위 매치는 현재 참가자가 ${v.participantCount}명으로 진행 가능성이 낮습니다.`,
    '',
    '근처에 진행 가능성이 높은 다른 매치로 이동하실 수 있어요. 아래 링크를 눌러 추천 매치를 확인해 주세요!',
    '※ 변경 가능 시간: 매치 시작 1시간 30분 전까지',
  ].join('\n');
}
