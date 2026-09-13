import { TenantLink as Link } from "@/components/TenantLink";

function Footer() {
  return (
    <footer className="bg-gray-900 py-6 text-white sm:py-8">
      <div className="container mx-auto grid grid-cols-1 gap-5 px-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-8">
        <div>
          <h3 className="text-lg font-semibold mb-2">About Us</h3>
          <p className="text-sm text-gray-400">
            We provide high-quality ECG solutions tailored for modern
            healthcare.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Quick Links</h3>
          <ul className="space-y-1.5 text-sm text-gray-300 sm:space-y-2">
            <li>
              <Link href="/" className="hover:text-white">
                Home
              </Link>
            </li>
            <li>
              <Link href="/categories" className="hover:text-white">
                categories
              </Link>
            </li>
            <li>
              <Link href="/carts" className="hover:text-white">
                My Cart
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Follow Us</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <a href="#" className="hover:text-white">
              Twitter
            </a>
            <a href="#" className="hover:text-white">
              LinkedIn
            </a>
            <a href="#" className="hover:text-white">
              GitHub
            </a>
          </div>
        </div>
      </div>

      <div className="mt-5 px-4 text-center text-xs text-gray-500 sm:mt-8">
        &copy; {new Date().getFullYear()} Shahar ECG Systems. All rights
        reserved.
      </div>
    </footer>
  );
}
export default Footer;
