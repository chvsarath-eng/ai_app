import { OrderConfirmation } from '@/app/order/[orderId]/order-confirmation'

export default async function OrderPage ({
  params,
  searchParams
}: {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ type?: string, payment?: string, txn?: string, tx?: string }>
}) {
  const { orderId } = await params
  const { type, payment, txn, tx } = await searchParams
  const outputType = type === 'LULU_BOOK' ? 'LULU_BOOK' : 'DIGI_BOOK'
  const paymentId = payment || txn || tx

  return <OrderConfirmation orderId={orderId} outputType={outputType} transactionId={paymentId} />
}
