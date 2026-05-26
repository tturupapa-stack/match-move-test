import { SurveyView } from '../../../components/survey-view';
import { serverFetch, type SurveyReport } from '../../../lib/api';

export default async function SurveysPage() {
  const r = await serverFetch<SurveyReport>('/api/admin/surveys');
  if (!r.ok) {
    return <p className="text-danger">설문 응답을 불러오지 못했습니다.</p>;
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">설문 응답</h1>
        <p className="mt-1 text-sm text-muted">
          매니저가 이동/유지 액션 직후 응답한 후속 설문(F-9) 결과입니다.
        </p>
      </header>
      <SurveyView report={r.data} />
    </div>
  );
}
