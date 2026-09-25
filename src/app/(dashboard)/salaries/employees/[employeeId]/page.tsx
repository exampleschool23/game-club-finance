import SalaryManager from '../../SalaryManager';

export default async function EmployeeHistoryPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  return <SalaryManager view="history" employeeId={employeeId} />;
}
