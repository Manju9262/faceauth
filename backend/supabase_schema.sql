-- Supabase Database Schema
-- Run this in your Supabase SQL Editor to set up the tables.

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Admins Table
create table if not exists admins (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    password_hash text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Employees Table
create table if not exists employees (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text unique not null,
    password_hash text not null,
    selfie_url text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Embeddings Table
create table if not exists embeddings (
    id bigserial primary key,
    employee_id uuid references employees(id) on delete cascade not null,
    embedding double precision[] not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Attendance Logs Table
create table if not exists attendance_logs (
    id bigserial primary key,
    employee_id uuid references employees(id) on delete cascade not null,
    timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
    similarity_score double precision not null,
    confidence_score double precision not null,
    status text not null, -- 'success' or 'failed'
    selfie_url text,
    action text -- 'Check In' or 'Check Out'
);

-- System Settings Table
create table if not exists system_settings (
    key text primary key,
    value text not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert default settings
insert into system_settings (key, value)
values ('similarity_threshold', '0.65')
on conflict (key) do nothing;

-- Disable Row Level Security (RLS) on all tables to allow Backend anon client CRUD operations
alter table admins disable row level security;
alter table employees disable row level security;
alter table embeddings disable row level security;
alter table attendance_logs disable row level security;
alter table system_settings disable row level security;

-- Seed default admin account: admin@zepiris.com / Admin@123
insert into admins (id, email, password_hash)
values (
  gen_random_uuid(), 
  'admin@zepiris.com', 
  'zepiris_salt_2026$aa773dfb1100a682862d86edfd99f961840329915cfda25d030a6be4c14d2784'
)
on conflict (email) do nothing;

-- Setup Storage Bucket and Access Policies
-- 1. Create a public bucket 'selfies' if it doesn't exist
insert into storage.buckets (id, name, public)
values ('selfies', 'selfies', true)
on conflict (id) do nothing;

-- 2. Create Storage Security Policies to allow anonymous public CRUD operations
drop policy if exists "Allow Public Reads" on storage.objects;
create policy "Allow Public Reads" on storage.objects for select using (bucket_id = 'selfies');

drop policy if exists "Allow Anonymous Uploads" on storage.objects;
create policy "Allow Anonymous Uploads" on storage.objects for insert with check (bucket_id = 'selfies');

-- NOTE FOR EXISTING DATABASES:
-- If you already created your tables previously, run the query below in the SQL Editor to add the 'action' column:
-- ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS action text;
