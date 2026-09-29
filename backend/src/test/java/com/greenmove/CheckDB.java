package com.greenmove;

import java.sql.*;

public class CheckDB {
    public static void main(String[] args) throws Exception {
        String url = "jdbc:postgresql://localhost:5432/postgres";
        String user = "postgres";
        String password = "password";
        try (Connection conn = DriverManager.getConnection(url, user, password)) {
            DatabaseMetaData meta = conn.getMetaData();
            System.out.println("PostgreSQL Version: " + meta.getDatabaseProductVersion());
            
            System.out.println("\n--- Indexes ---");
            String q1 = "SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('vehicle_pool', 'vehicle_pool_member');";
            try (Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(q1)) {
                while(rs.next()) {
                    System.out.println(rs.getString(1) + " | " + rs.getString(2));
                }
            }
            
            System.out.println("\n--- Constraints ---");
            String q2 = "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'vehicle_pool_member'::regclass;";
            try (Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(q2)) {
                while(rs.next()) {
                    System.out.println(rs.getString(1) + " | " + rs.getString(2));
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
