import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import DeveloperSidebar from './DeveloperSidebar';
import DeveloperHeader from './DeveloperHeader';

export default function DeveloperLayout() {
  const isDeveloperAuthenticated = localStorage.getItem('developerToken') !== null;

  if (!isDeveloperAuthenticated) {
    return <Navigate to="/developer/login" replace />;
  }

  return (
    <div className="bg-background text-on-background font-body-md antialiased min-h-screen">
      <DeveloperSidebar />
      <div className="md:ml-[260px] min-h-screen flex flex-col">
        <DeveloperHeader />
        <main className="flex-1 flex flex-col min-h-0 p-4 md:p-6 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
