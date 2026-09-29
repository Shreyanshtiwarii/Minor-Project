import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';

export default function AdminLayout() {
  const isAdminAuthenticated = localStorage.getItem('adminToken') !== null;

  if (!isAdminAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="bg-background text-on-background font-body-md antialiased min-h-screen">
      <AdminSidebar />
      <div className="md:ml-[260px] min-h-screen flex flex-col">
        <AdminHeader />
        <main className="flex-1 flex flex-col min-h-0 p-4 md:p-6 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
