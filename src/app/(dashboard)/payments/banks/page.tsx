import { redirect } from 'next/navigation';

export default function PaymentsBanksRedirect() {
  redirect('/accounting/banks');
}
