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
import Image from "next/image";

export type LanguageOption = {
  label: string;
  value: string;
  flag: string;
};

export default function LanguageSelector() {
  const [selected, setSelected] = useState<LanguageOption | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const cookieLocale = document.cookie
      .split("; ")
      .find((row) => row.startsWith("SHOPNEST_LOCALE="))
      ?.split("=")[1];

    const initialLocale = cookieLocale || "he";
    const match = languages.find((lang) => lang.value === initialLocale);
    setSelected(match ?? languages[0]);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Language: ${selected?.label ?? "Select language"}`}
          className="h-11 min-w-11 gap-1 px-2 sm:w-[180px] sm:justify-around sm:px-3"
        >
          <Image
            src={selected?.flag ?? languages[0].flag}
            width={26}
            height={20}
            alt=""
            className="shrink-0"
          />
          <span className="hidden sm:inline">{selected?.label}</span>
          <ChevronsUpDownIcon className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 max-w-[calc(100vw-1.5rem)] p-0 sm:w-[180px]">
        <Command>
          <CommandInput placeholder="Search language..." />
          <CommandGroup>
            {languages.map((lang) => (
              <CommandItem
                className="flex min-h-11 items-center justify-around"
                key={lang.value}
                onSelect={() => {
                  setSelected(lang);
                  setOpen(false);
                  // Optional: trigger i18n change here
                  document.cookie = `SHOPNEST_LOCALE=${lang.value}; path=/; max-age=31536000; SameSite=Lax`;
                  router.refresh();
                }}
              >
                <CheckIcon
                  className={cn(
                    "h-4 w-4",
                    lang.value === selected?.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <Image
                  src={lang.flag}
                  width={30}
                  height={22}
                  alt=""
                />
                <div className="w-[60px] text-end">{lang.label}</div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
