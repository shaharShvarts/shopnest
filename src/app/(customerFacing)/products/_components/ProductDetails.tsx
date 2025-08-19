"use client";

export default function ProductDetails({ product }: any) {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="grid grid-cols-2">
        <div className="flex flex-col items-center p-4">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-auto max-w-md object-cover mb-4"
          />
          <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
          <p className="text-lg text-gray-700 mb-4">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(product.price)}
          </p>
          <p className="text-gray-600">{product.description}</p>
        </div>
        <div className="flex flex-col items-center justify-center p-4">
          {/* <button
                className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
                onClick={() => alert("Purchase functionality not implemented yet")}
              >
                Purchase
              </button> */}
        </div>
      </div>
    </div>
  );
}
