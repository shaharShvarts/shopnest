export default function ShippingAddress({ prefix }: { prefix: string }) {
  return (
    <section>
      <div className="grid grid-cols-2 gap-4">
        <input
          name={`${prefix}_firstName`}
          placeholder="First Name"
          className="border p-2 rounded"
        />
        <input
          name={`${prefix}_lastName`}
          placeholder="Last Name"
          className="border p-2 rounded"
        />
      </div>
      <input
        name={`${prefix}_company`}
        placeholder="Company (optional)"
        className="w-full border p-2 rounded mt-4"
      />
      <input
        name={`${prefix}_address`}
        placeholder="Address"
        className="w-full border p-2 rounded mt-4"
      />
      <input
        name={`${prefix}_apartment`}
        placeholder="Apartment, suite, etc. (optional)"
        className="w-full border p-2 rounded mt-4"
      />
      <div className="grid grid-cols-3 gap-4 mt-4">
        <input
          name={`${prefix}_city`}
          placeholder="City"
          className="border p-2 rounded"
        />
        <select name={`${prefix}_state`} className="border p-2 rounded">
          <option value="">State</option>
          <option value="NY">Israel</option>
        </select>
        <input
          name={`${prefix}_postal`}
          placeholder="ZIP Code"
          className="border p-2 rounded"
        />
      </div>
      <input
        name={`${prefix}_phone`}
        placeholder="Phone"
        className="w-full border p-2 rounded mt-4"
      />
    </section>
  );
}
