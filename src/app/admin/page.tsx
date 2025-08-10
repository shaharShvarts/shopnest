// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import { db } from "@/drizzle/db";
// import { orders, products, users } from "@/drizzle/schema";
// import { formatCurrency, formatNumber } from "@/lib/formatters";
// import { count, sum, eq } from "drizzle-orm";

// async function getSalesData() {
//   const [data] = await db
//     .select({
//       orderCount: count().as("order_count"),
//       totalPrice: sum(orders.totalPrice).mapWith(Number).as("total_price"),
//     })
//     .from(orders);

//   return {
//     amount: data.orderCount || 0,
//     numberOfSales: Number(data.totalPrice) || 0,
//   };
// }

// async function getUserData() {
//   const [[userCount], [orderData]] = await Promise.all([
//     db
//       .select({
//         userCount: count().as("user_count"),
//       })
//       .from(users),
//     db
//       .select({
//         totalPrice: sum(orders.totalPrice).mapWith(Number).as("total_price"),
//       })
//       .from(orders),
//   ]);

//   const totalPrice = orderData.totalPrice || 0;
//   const userCountValue = userCount.userCount;

//   return {
//     userCount: userCountValue || 0,
//     averageValuePerUser:
//       userCountValue === 0 ? 0 : totalPrice / userCountValue / 100,
//   };
// }

// async function getProductsData() {
//   const [[activeCount], [inactiveCount]] = await Promise.all([
//     db
//       .select({ activeCount: count(products.isActive).as("active_count") })
//       .from(products)
//       .where(eq(products.isActive, true)),
//     db
//       .select({ inactiveCount: count(products.isActive).as("active_count") })
//       .from(products)
//       .where(eq(products.isActive, false)),
//   ]);

//   return {
//     activeCount: activeCount.activeCount,
//     inactiveCount: inactiveCount.inactiveCount,
//   };
// }

export default async function AdminDashboard() {
  return <h1>HHH</h1>;
  // const [salesData, userData, productsData] = await Promise.all([
  //   getSalesData(),
  //   getUserData(),
  //   getProductsData(),
  // ]);

  // return (
  //   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  //     <DashboardCard
  //       title="Sales"
  //       subtitle={`${formatNumber(salesData.numberOfSales)} Sales`}
  //       body={formatCurrency(salesData.amount)}
  //     />
  //     <DashboardCard
  //       title="Customer"
  //       subtitle={`${formatNumber(userData.averageValuePerUser)} Average Value`}
  //       body={formatCurrency(userData.userCount)}
  //     />
  //     <DashboardCard
  //       title="Active Products"
  //       subtitle={`${formatNumber(productsData.inactiveCount)} Inactive`}
  //       body={formatNumber(productsData.activeCount)}
  //     />
  //   </div>
  // );
}

// type DashboardCardProps = {
//   title: string;
//   subtitle: string;
//   body: string;
// };

// const DashboardCard = ({ title, subtitle, body }: DashboardCardProps) => {
//   return (
//     <Card>
//       <CardHeader>
//         <CardTitle>{title}</CardTitle>
//         <CardDescription>{subtitle}</CardDescription>
//       </CardHeader>
//       <CardContent>
//         <p>{body}</p>
//       </CardContent>
//     </Card>
//   );
// };
