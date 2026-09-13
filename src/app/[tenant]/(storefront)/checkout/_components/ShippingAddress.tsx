export default function ShippingAddress({
  prefix,
  defaultName = "",
  requireAddress,
}: {
  prefix: string;
  defaultName?: string;
  requireAddress: boolean;
}) {
  const inputClassName = "min-h-11 w-full rounded border p-2";

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input
          name={`${prefix}_name`}
          placeholder="First Name"
          autoComplete="given-name"
          required
          defaultValue={defaultName}
          className={inputClassName}
        />
        <input
          name={`${prefix}_lastName`}
          placeholder="Last Name"
          autoComplete="family-name"
          required
          className={inputClassName}
        />
      </div>
      {requireAddress ? <>
        <input name={`${prefix}_company`} placeholder="Company (optional)" className={inputClassName} />
        <input name={`${prefix}_address`} placeholder="Address" autoComplete="street-address" required className={inputClassName} />
        <input name={`${prefix}_apartment`} placeholder="Apartment, suite, etc. (optional)" className={inputClassName} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <input
          name={`${prefix}_city`}
          placeholder="City"
          autoComplete="address-level2"
          required
          className={inputClassName}
        />
        <select
          name={`${prefix}_state`}
          className={inputClassName}
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
          className={inputClassName}
        />
        </div>
      </> : <>
        <input type="hidden" name={`${prefix}_address`} value="" />
        <input type="hidden" name={`${prefix}_city`} value="" />
        <input type="hidden" name={`${prefix}_state`} value="" />
        <input type="hidden" name={`${prefix}_postal`} value="" />
      </>}
      <input
        name={`${prefix}_phone`}
        placeholder="Phone"
        type="tel"
        autoComplete="tel"
        required
        className={inputClassName}
      />
    </section>
  );
}
