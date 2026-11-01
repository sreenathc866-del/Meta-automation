-- schema.sql
-- Run this in your Supabase SQL Editor to create the necessary tables.

CREATE TYPE lead_status_enum AS ENUM ('HOT', 'WARM', 'COLD', 'UNQUALIFIED');
CREATE TYPE urgency_enum AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');

-- Leads Table
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT,
    phone_number TEXT UNIQUE NOT NULL,
    business_type TEXT,
    service_required TEXT,
    requirements TEXT,
    budget TEXT,
    timeline TEXT,
    urgency urgency_enum DEFAULT 'UNKNOWN',
    lead_score INTEGER DEFAULT 0,
    lead_status lead_status_enum DEFAULT 'UNQUALIFIED',
    sales_team_notified BOOLEAN DEFAULT false,
    assigned_agent TEXT,
    human_needed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    sender TEXT NOT NULL, -- 'customer', 'ai', 'human'
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
