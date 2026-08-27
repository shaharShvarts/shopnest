export default function ShippingAddress({ prefix }: { prefix: string }) {
  return (
    <section>
      <div className="grid grid-cols-2 gap-4">
        <input
          name={`${prefix}_name`}
          placeholder="First Name"
          autoComplete="given-name"
          required
          className="border p-2 rounded"
        />
        <input
          name={`${prefix}_lastName`}
          placeholder="Last Name"
          autoComplete="family-name"
          required
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
        autoComplete="street-address"
        required
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
          autoComplete="address-level2"
          required
          className="border p-2 rounded"
        />
        <select
          name={`${prefix}_state`}
          className="border p-2 rounded"
          autoComplete="country-name"
          required
        >
          <option value="">State</option>
          <option value="Israel">Israel</option>
        </select>
        <input
          name={`${prefix}_postal`}
          placeholder="ZIP Code"
          autoComplete="postal-code"
          required
          className="border p-2 rounded"
        />
      </div>
      <input
        name={`${prefix}_phone`}
        placeholder="Phone"
        type="tel"
        autoComplete="tel"
        required
        className="w-full border p-2 rounded mt-4"
      />
    </section>
  );
}
