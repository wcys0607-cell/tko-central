"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface ComingSoonProps {
  title: string;
  phase: string;
  icon: LucideIcon;
}

export function ComingSoon({ title, phase, icon: Icon }: ComingSoonProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-8 space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-primary">{title}</h2>
          <p className="text-muted-foreground">Coming in {phase}</p>
          <div className="h-1 w-12 mx-auto rounded bg-accent" />
        </CardContent>
      </Card>
    </div>
  );
}
