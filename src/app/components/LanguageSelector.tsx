"use client";

import { useState } from "react";
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

export default function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(languages[0]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[180px] justify-around">
          <img src={`/${selected.flag}.svg`} width="30" alt={selected.label} />
          {selected.label}
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
                }}
              >
                <CheckIcon
                  className={cn(
                    "h-4 w-4",
                    lang.value === selected.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <img
                  src={`/${lang.flag}.svg`}
                  width="30"
                  alt={selected.label}
                />
                <div className="w-[60px] text-right mr-2">{lang.label}</div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
