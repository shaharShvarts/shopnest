"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { languages } from "@/lib/languages";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandInput,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type LanguageOption = {
  label: string;
  value: string;
  flag: string;
};

export default function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const [selected, setSelected] = useState<LanguageOption | null>(null);

  useEffect(() => {
    const cookieLocale = document.cookie
      .split("; ")
      .find((row) => row.startsWith("SHOPNEST_LOCALE="))
      ?.split("=")[1];

    const initialLocale = cookieLocale || "he";

    const match = languages.find((lang) => lang.value === initialLocale);
    setSelected(match ?? languages[0]);
  }, [router]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[180px] justify-around">
          <img src={selected?.flag} width="30" alt={selected?.label} />
          {selected?.label}
          <ChevronsUpDownIcon className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-0">
        <Command>
          <CommandInput placeholder="Search language..." />
          <CommandGroup>
            {languages.map((lang) => (
              <CommandItem
                className="flex justify-around items-around"
                key={lang.value}
                onSelect={() => {
                  setSelected(lang);
                  setOpen(false);
                  // Optional: trigger i18n change here
                  document.cookie = `SHOPNEST_LOCALE=${lang.value}; path=/; max-age=31536000`;

                  router.refresh();
                }}
              >
                <CheckIcon
                  className={cn(
                    "h-4 w-4",
                    lang.value === selected?.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <img src={lang.flag} width="30" alt={lang?.label} />
                <div className="w-[60px] text-right mr-2">{lang.label}</div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
