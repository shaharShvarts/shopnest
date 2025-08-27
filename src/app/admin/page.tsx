import { LogIn, LogInIcon, ShoppingCart, UserRound } from "lucide-react";
import LanguageSelector from "../components/LanguageSelector";

export default function AdminDashboard() {
  return (
    <header className="sticky top-0 border-b border-gray-800 bg-white z-50">
      <div className="max-w-7xl mx-auto py-3 flex items-center justify-between">
        <div className="flex flex-col justify-center items-center">
          <h1 className="font-bold text-3xl font-serif">Dvorik</h1>
          <h2 className="font-bold text-gray-500">⭐ Collection ⭐</h2>
        </div>
        <div className="flex items-center justify-between gap-4">
          <LanguageSelector />
          <ShoppingCart className="w-8 h-8 text-gray-800" />
          <UserRound className="w-8 h-8 text-gray-800" />
        </div>
      </div>
    </header>
  );
}
