function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-8">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="text-lg font-semibold mb-2">About Us</h3>
          <p className="text-sm text-gray-400">
            We provide high-quality ECG solutions tailored for modern
            healthcare.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Quick Links</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>
              <a href="/" className="hover:text-white">
                Home
              </a>
            </li>
            <li>
              <a href="/categories" className="hover:text-white">
                categories
              </a>
            </li>
            <li>
              <a href="/carts" className="hover:text-white">
                My Cart
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Follow Us</h3>
          <div className="flex space-x-4">
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

      <div className="mt-8 text-center text-xs text-gray-500">
        &copy; {new Date().getFullYear()} Shahar ECG Systems. All rights
        reserved.
      </div>
    </footer>
  );
}
export default Footer;
