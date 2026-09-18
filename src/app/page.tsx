import { CapabilitiesSection } from "./(marketing)/_components/CapabilitiesSection";
import { DemoStoresSection } from "./(marketing)/_components/DemoStoresSection";
import { FaqSection } from "./(marketing)/_components/FaqSection";
import { FinalCtaSection } from "./(marketing)/_components/FinalCtaSection";
import { HeroSection } from "./(marketing)/_components/HeroSection";
import { HowItWorksSection } from "./(marketing)/_components/HowItWorksSection";
import { MarketingFooter } from "./(marketing)/_components/MarketingFooter";
import { MarketingHeader } from "./(marketing)/_components/MarketingHeader";
import { PricingPreview } from "./(marketing)/_components/PricingPreview";
import { WhyShopNestSection } from "./(marketing)/_components/WhyShopNestSection";

export const metadata = {
  title: "ShopNest",
  description: "Build and prepare your online store with ShopNest, then publish when it is ready.",
};

export default function PlatformHomePage() {
  return (
    <>
      <MarketingHeader />
      <main>
        <HeroSection />
        <WhyShopNestSection />
        <CapabilitiesSection />
        <HowItWorksSection />
        <PricingPreview />
        <DemoStoresSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <MarketingFooter />
    </>
  );
}
