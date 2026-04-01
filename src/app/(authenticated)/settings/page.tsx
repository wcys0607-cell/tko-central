"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings } from "lucide-react";
import { AppConfigTab } from "@/components/settings/app-config-tab";
import { UserManagementTab } from "@/components/settings/user-management-tab";
import { BukkuConnectionTab } from "@/components/settings/bukku-connection-tab";
import { AgentsTab } from "@/components/settings/agents-tab";

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-primary">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage app configuration and users
          </p>
        </div>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">App Configuration</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="bukku">Bukku Connection</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <AppConfigTab />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UserManagementTab />
        </TabsContent>

        <TabsContent value="bukku" className="mt-4">
          <BukkuConnectionTab />
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <AgentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
