import { OrderConfirmation } from '@/app/order/[orderId]/order-confirmation'

export default async function OrderPage ({
  params,
  searchParams
}: {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { orderId } = await params
  const { type } = await searchParams
  const outputType = type === 'LULU_BOOK' ? 'LULU_BOOK' : 'DIGI_BOOK'
  
  return <OrderConfirmation orderId={orderId} outputType={outputType} />
}
