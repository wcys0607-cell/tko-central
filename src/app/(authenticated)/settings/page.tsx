"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings } from "lucide-react";
import { AppConfigTab } from "@/components/settings/app-config-tab";
import { UserManagementTab } from "@/components/settings/user-management-tab";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-[#1A3A5C]/10 p-2">
          <Settings className="h-5 w-5 text-[#1A3A5C]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#1A3A5C]">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage app configuration and users
          </p>
        </div>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">App Configuration</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <AppConfigTab />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UserManagementTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
