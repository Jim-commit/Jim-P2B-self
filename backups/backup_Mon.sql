--
-- PostgreSQL database dump
--

\restrict hJAH4Mg2aU9tBEau6iGfqtENehxhBXqYnbRi1FEeGtgVL1ij7j8lTekAs3VWVGM

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.7 (Ubuntu 18.7-1.pgdg26.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP POLICY IF EXISTS "租户订单明细隔离" ON public.order_item;
DROP POLICY IF EXISTS "租户订单操作隔离" ON public.orders;
DROP POLICY IF EXISTS "租户流水隔离" ON public.payment_record;
DROP POLICY IF EXISTS "租户查看所属总代信息" ON public.tenant;
DROP POLICY IF EXISTS "租户数据读取隔离" ON public.store;
DROP POLICY IF EXISTS "租户商品读取隔离" ON public.product;
DROP POLICY IF EXISTS "允许所有人读写 store_order" ON public.store_order;
DROP POLICY IF EXISTS public_read_suggestion_board ON public.platform_suggestion_board;
DROP POLICY IF EXISTS deny_anon_all_vault ON public.tenant_security_vault;
DROP POLICY IF EXISTS deny_anon_all_ratelimit ON public.auth_rate_limit;
DROP POLICY IF EXISTS deny_all_vault ON public.tenant_security_vault;
DROP POLICY IF EXISTS deny_all_ratelimit ON public.auth_rate_limit;
DROP POLICY IF EXISTS anon_insert_suggestion_only ON public.platform_suggestion_board;
DROP POLICY IF EXISTS allow_write_gov_config ON public.platform_governance_config;
DROP POLICY IF EXISTS allow_update_tenant ON public.platform_tenant;
DROP POLICY IF EXISTS allow_update_orders ON public.store_order;
DROP POLICY IF EXISTS allow_update_logs ON public.driver_collection_log;
DROP POLICY IF EXISTS allow_read_orders ON public.store_order;
DROP POLICY IF EXISTS allow_read_logs ON public.driver_collection_log;
DROP POLICY IF EXISTS allow_read_inv_log ON public.inventory_log;
DROP POLICY IF EXISTS allow_read_gov_config ON public.platform_governance_config;
DROP POLICY IF EXISTS allow_public_write_gov_configs ON public.platform_gov_configs;
DROP POLICY IF EXISTS allow_public_update_tenant_sub_user ON public.tenant_sub_user;
DROP POLICY IF EXISTS allow_public_update_tenant_application ON public.tenant_application;
DROP POLICY IF EXISTS allow_public_update_store_order ON public.store_order;
DROP POLICY IF EXISTS allow_public_update_platform_tenant ON public.platform_tenant;
DROP POLICY IF EXISTS allow_public_update_platform_suggestion_board ON public.platform_suggestion_board;
DROP POLICY IF EXISTS allow_public_update_platform_category ON public.platform_category;
DROP POLICY IF EXISTS allow_public_update_login_qr_session ON public.login_qr_session;
DROP POLICY IF EXISTS allow_public_update_local_inventory_pool ON public.local_inventory_pool;
DROP POLICY IF EXISTS allow_public_update_inventory_log ON public.inventory_log;
DROP POLICY IF EXISTS allow_public_update_driver_collection_log ON public.driver_collection_log;
DROP POLICY IF EXISTS allow_public_update_demand_forecast_plan ON public.demand_forecast_plan;
DROP POLICY IF EXISTS allow_public_select_tenant_sub_user ON public.tenant_sub_user;
DROP POLICY IF EXISTS allow_public_select_tenant_application ON public.tenant_application;
DROP POLICY IF EXISTS allow_public_select_store_order ON public.store_order;
DROP POLICY IF EXISTS allow_public_select_platform_tenant ON public.platform_tenant;
DROP POLICY IF EXISTS allow_public_select_platform_suggestion_board ON public.platform_suggestion_board;
DROP POLICY IF EXISTS allow_public_select_platform_category ON public.platform_category;
DROP POLICY IF EXISTS allow_public_select_login_qr_session ON public.login_qr_session;
DROP POLICY IF EXISTS allow_public_select_local_inventory_pool ON public.local_inventory_pool;
DROP POLICY IF EXISTS allow_public_select_inventory_log ON public.inventory_log;
DROP POLICY IF EXISTS allow_public_select_driver_collection_log ON public.driver_collection_log;
DROP POLICY IF EXISTS allow_public_select_demand_forecast_plan ON public.demand_forecast_plan;
DROP POLICY IF EXISTS allow_public_select_audit_immutable_log ON public.audit_immutable_log;
DROP POLICY IF EXISTS allow_public_read_store ON public.store;
DROP POLICY IF EXISTS allow_public_read_product ON public.product;
DROP POLICY IF EXISTS allow_public_read_local_inventory_pool ON public.local_inventory_pool;
DROP POLICY IF EXISTS allow_public_read_gov_configs ON public.platform_gov_configs;
DROP POLICY IF EXISTS allow_public_read_demand_forecast_plan ON public.demand_forecast_plan;
DROP POLICY IF EXISTS allow_public_insert_tenant_sub_user ON public.tenant_sub_user;
DROP POLICY IF EXISTS allow_public_insert_tenant_application ON public.tenant_application;
DROP POLICY IF EXISTS allow_public_insert_store_order ON public.store_order;
DROP POLICY IF EXISTS allow_public_insert_platform_tenant ON public.platform_tenant;
DROP POLICY IF EXISTS allow_public_insert_platform_suggestion_board ON public.platform_suggestion_board;
DROP POLICY IF EXISTS allow_public_insert_platform_category ON public.platform_category;
DROP POLICY IF EXISTS allow_public_insert_login_qr_session ON public.login_qr_session;
DROP POLICY IF EXISTS allow_public_insert_local_inventory_pool ON public.local_inventory_pool;
DROP POLICY IF EXISTS allow_public_insert_inventory_log ON public.inventory_log;
DROP POLICY IF EXISTS allow_public_insert_driver_collection_log ON public.driver_collection_log;
DROP POLICY IF EXISTS allow_public_insert_demand_forecast_plan ON public.demand_forecast_plan;
DROP POLICY IF EXISTS allow_public_insert_audit_immutable_log ON public.audit_immutable_log;
DROP POLICY IF EXISTS allow_public_delete_tenant_application ON public.tenant_application;
DROP POLICY IF EXISTS allow_public_delete_store_order ON public.store_order;
DROP POLICY IF EXISTS allow_public_delete_platform_suggestion_board ON public.platform_suggestion_board;
DROP POLICY IF EXISTS allow_public_delete_platform_category ON public.platform_category;
DROP POLICY IF EXISTS allow_public_delete_login_qr_session ON public.login_qr_session;
DROP POLICY IF EXISTS allow_public_delete_local_inventory_pool ON public.local_inventory_pool;
DROP POLICY IF EXISTS allow_public_delete_inventory_log ON public.inventory_log;
DROP POLICY IF EXISTS allow_public_delete_driver_collection_log ON public.driver_collection_log;
DROP POLICY IF EXISTS allow_public_delete_demand_forecast_plan ON public.demand_forecast_plan;
DROP POLICY IF EXISTS allow_public_all_cat_dict ON public.platform_category_dict;
DROP POLICY IF EXISTS allow_insert_orders ON public.store_order;
DROP POLICY IF EXISTS allow_insert_logs ON public.driver_collection_log;
DROP POLICY IF EXISTS allow_insert_inv_log ON public.inventory_log;
DROP POLICY IF EXISTS allow_insert_audit_immutable_log ON public.audit_immutable_log;
DROP POLICY IF EXISTS allow_audit_select_only ON public.audit_immutable_log;
DROP POLICY IF EXISTS allow_audit_insert_only ON public.audit_immutable_log;
DROP POLICY IF EXISTS allow_all_standard_category ON public.platform_standard_category;
DROP POLICY IF EXISTS allow_all_qr_session ON public.login_qr_session;
DROP POLICY IF EXISTS allow_all_membership_plan ON public.platform_membership_plan;
DROP POLICY IF EXISTS allow_all_compliance_case ON public.platform_compliance_case;
DROP POLICY IF EXISTS allow_all_access_tenant_application ON public.tenant_application;
DROP POLICY IF EXISTS allow_all_access_store_order ON public.store_order;
DROP POLICY IF EXISTS allow_all_access_store_lead ON public.store_lead;
DROP POLICY IF EXISTS allow_all_access_platform_suggestion_board ON public.platform_suggestion_board;
DROP POLICY IF EXISTS allow_all_access_platform_category ON public.platform_category;
DROP POLICY IF EXISTS allow_all_access_inventory_log ON public.inventory_log;
DROP POLICY IF EXISTS allow_all_access_driver_collection_log ON public.driver_collection_log;
DROP POLICY IF EXISTS allow_all_access_audit_immutable_log ON public.audit_immutable_log;
DROP POLICY IF EXISTS "Allow select tenant_application" ON public.tenant_application;
DROP POLICY IF EXISTS "Allow public select tenant_application" ON public.tenant_application;
DROP POLICY IF EXISTS "Allow public select platform_tenant" ON public.platform_tenant;
DROP POLICY IF EXISTS "Allow public insert tenant_application" ON public.tenant_application;
DROP POLICY IF EXISTS "Allow public insert platform_tenant" ON public.platform_tenant;
DROP POLICY IF EXISTS "Allow public delete tenant_application" ON public.tenant_application;
DROP POLICY IF EXISTS "Allow full access tenant_application" ON public.tenant_application;
DROP POLICY IF EXISTS "Allow full access platform_suggestion_board" ON public.platform_suggestion_board;
DROP POLICY IF EXISTS "Allow full access platform_category" ON public.platform_category;
DROP POLICY IF EXISTS "Allow anon update platform_tenant" ON public.platform_tenant;
DROP POLICY IF EXISTS "Allow anon read platform_admin_credential" ON public.platform_admin_credential;
DROP POLICY IF EXISTS "Allow anon insert audit_immutable_log" ON public.audit_immutable_log;
DROP POLICY IF EXISTS "Allow all for platform_suggestion_board" ON public.platform_suggestion_board;
ALTER TABLE IF EXISTS ONLY public.payment_record DROP CONSTRAINT IF EXISTS payment_record_store_id_fkey;
ALTER TABLE IF EXISTS ONLY public.payment_record DROP CONSTRAINT IF EXISTS payment_record_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_store_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_item DROP CONSTRAINT IF EXISTS order_item_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_item DROP CONSTRAINT IF EXISTS order_item_order_id_fkey;
DROP TRIGGER IF EXISTS trg_protect_audit_log ON public.audit_immutable_log;
DROP TRIGGER IF EXISTS trg_prevent_audit_update ON public.audit_immutable_log;
DROP TRIGGER IF EXISTS trg_immutable_audit_log ON public.audit_immutable_log;
DROP TRIGGER IF EXISTS trg_guard_public_order_spam ON public.store_order;
DROP TRIGGER IF EXISTS trg_block_delete_store_order ON public.store_order;
DROP TRIGGER IF EXISTS trg_block_delete_store ON public.store;
DROP TRIGGER IF EXISTS trg_block_delete_product ON public.product;
DROP TRIGGER IF EXISTS trg_block_delete_inventory_log ON public.inventory_log;
DROP TRIGGER IF EXISTS trg_block_delete_driver_collection_log ON public.driver_collection_log;
DROP INDEX IF EXISTS public.idx_unique_tenant_credit_code;
DROP INDEX IF EXISTS public.idx_store_tenant_route;
DROP INDEX IF EXISTS public.idx_store_tenant_debt;
DROP INDEX IF EXISTS public.idx_store_tenant;
DROP INDEX IF EXISTS public.idx_store_tags;
DROP INDEX IF EXISTS public.idx_store_order_tenant_status;
DROP INDEX IF EXISTS public.idx_store_order_store_id;
DROP INDEX IF EXISTS public.idx_store_order_last_delivery_tx_uuid;
DROP INDEX IF EXISTS public.idx_qr_session_ticket;
DROP INDEX IF EXISTS public.idx_product_tenant_status;
DROP INDEX IF EXISTS public.idx_product_tenant;
DROP INDEX IF EXISTS public.idx_product_tags;
DROP INDEX IF EXISTS public.idx_payment_tenant_store;
DROP INDEX IF EXISTS public.idx_orders_tenant_status;
DROP INDEX IF EXISTS public.idx_orders_tenant;
DROP INDEX IF EXISTS public.idx_local_pool_tenant_status;
DROP INDEX IF EXISTS public.idx_inv_log_tenant_created;
DROP INDEX IF EXISTS public.idx_driver_log_tenant_driver;
DROP INDEX IF EXISTS public.idx_driver_collection_client_tx_uuid;
DROP INDEX IF EXISTS public.idx_demand_plan_tenant_status;
ALTER TABLE IF EXISTS ONLY public.tenant_sub_user DROP CONSTRAINT IF EXISTS tenant_sub_user_tenant_id_account_name_key;
ALTER TABLE IF EXISTS ONLY public.tenant_sub_user DROP CONSTRAINT IF EXISTS tenant_sub_user_pkey;
ALTER TABLE IF EXISTS ONLY public.tenant_security_vault DROP CONSTRAINT IF EXISTS tenant_security_vault_pkey;
ALTER TABLE IF EXISTS ONLY public.tenant DROP CONSTRAINT IF EXISTS tenant_pkey;
ALTER TABLE IF EXISTS ONLY public.tenant_application DROP CONSTRAINT IF EXISTS tenant_application_pkey;
ALTER TABLE IF EXISTS ONLY public.sys_qr_session DROP CONSTRAINT IF EXISTS sys_qr_session_ticket_key;
ALTER TABLE IF EXISTS ONLY public.sys_qr_session DROP CONSTRAINT IF EXISTS sys_qr_session_pkey;
ALTER TABLE IF EXISTS ONLY public.store DROP CONSTRAINT IF EXISTS store_wechat_openid_key;
ALTER TABLE IF EXISTS ONLY public.store DROP CONSTRAINT IF EXISTS store_pkey;
ALTER TABLE IF EXISTS ONLY public.store DROP CONSTRAINT IF EXISTS store_phone_key;
ALTER TABLE IF EXISTS ONLY public.store_order DROP CONSTRAINT IF EXISTS store_order_pkey;
ALTER TABLE IF EXISTS ONLY public.store_lead DROP CONSTRAINT IF EXISTS store_lead_pkey;
ALTER TABLE IF EXISTS ONLY public.product DROP CONSTRAINT IF EXISTS product_pkey;
ALTER TABLE IF EXISTS ONLY public.product DROP CONSTRAINT IF EXISTS product_barcode_key;
ALTER TABLE IF EXISTS ONLY public.platform_tenant DROP CONSTRAINT IF EXISTS platform_tenant_tenant_id_key;
ALTER TABLE IF EXISTS ONLY public.platform_tenant DROP CONSTRAINT IF EXISTS platform_tenant_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_tenant DROP CONSTRAINT IF EXISTS platform_tenant_invite_code_key;
ALTER TABLE IF EXISTS ONLY public.platform_suggestion_board DROP CONSTRAINT IF EXISTS platform_suggestion_board_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_standard_category DROP CONSTRAINT IF EXISTS platform_standard_category_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_membership_plan DROP CONSTRAINT IF EXISTS platform_membership_plan_plan_code_key;
ALTER TABLE IF EXISTS ONLY public.platform_membership_plan DROP CONSTRAINT IF EXISTS platform_membership_plan_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_governance_config DROP CONSTRAINT IF EXISTS platform_governance_config_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_gov_configs DROP CONSTRAINT IF EXISTS platform_gov_configs_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_compliance_case DROP CONSTRAINT IF EXISTS platform_compliance_case_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_category DROP CONSTRAINT IF EXISTS platform_category_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_category_dict DROP CONSTRAINT IF EXISTS platform_category_dict_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_category_dict DROP CONSTRAINT IF EXISTS platform_category_dict_category_name_key;
ALTER TABLE IF EXISTS ONLY public.platform_admin_credential DROP CONSTRAINT IF EXISTS platform_admin_credential_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_admin_credential DROP CONSTRAINT IF EXISTS platform_admin_credential_admin_account_key;
ALTER TABLE IF EXISTS ONLY public.payment_record DROP CONSTRAINT IF EXISTS payment_record_pkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_pkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_order_no_key;
ALTER TABLE IF EXISTS ONLY public.order_item DROP CONSTRAINT IF EXISTS order_item_pkey;
ALTER TABLE IF EXISTS ONLY public.onboarding_query_guard DROP CONSTRAINT IF EXISTS onboarding_query_guard_pkey;
ALTER TABLE IF EXISTS ONLY public.login_qr_session DROP CONSTRAINT IF EXISTS login_qr_session_pkey;
ALTER TABLE IF EXISTS ONLY public.local_inventory_pool DROP CONSTRAINT IF EXISTS local_inventory_pool_pkey;
ALTER TABLE IF EXISTS ONLY public.inventory_log DROP CONSTRAINT IF EXISTS inventory_log_pkey;
ALTER TABLE IF EXISTS ONLY public.driver DROP CONSTRAINT IF EXISTS driver_pkey;
ALTER TABLE IF EXISTS ONLY public.driver_collection_log DROP CONSTRAINT IF EXISTS driver_collection_log_pkey;
ALTER TABLE IF EXISTS ONLY public.demand_forecast_plan DROP CONSTRAINT IF EXISTS demand_forecast_plan_pkey;
ALTER TABLE IF EXISTS ONLY public.auth_rate_limit DROP CONSTRAINT IF EXISTS auth_rate_limit_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_immutable_log DROP CONSTRAINT IF EXISTS audit_immutable_log_pkey;
ALTER TABLE IF EXISTS public.tenant_sub_user ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tenant_application ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sys_qr_session ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.store_order ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.store_lead ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.platform_tenant ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.platform_suggestion_board ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.platform_standard_category ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.platform_membership_plan ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.platform_compliance_case ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.platform_admin_credential ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.local_inventory_pool ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.inventory_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.driver_collection_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.driver ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.demand_forecast_plan ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.audit_immutable_log ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.tenant_sub_user_id_seq;
DROP TABLE IF EXISTS public.tenant_sub_user;
DROP TABLE IF EXISTS public.tenant_security_vault;
DROP SEQUENCE IF EXISTS public.tenant_application_id_seq;
DROP TABLE IF EXISTS public.tenant_application;
DROP TABLE IF EXISTS public.tenant;
DROP SEQUENCE IF EXISTS public.sys_qr_session_id_seq;
DROP TABLE IF EXISTS public.sys_qr_session;
DROP SEQUENCE IF EXISTS public.store_order_id_seq;
DROP TABLE IF EXISTS public.store_order;
DROP SEQUENCE IF EXISTS public.store_lead_id_seq;
DROP TABLE IF EXISTS public.store_lead;
DROP TABLE IF EXISTS public.store;
DROP VIEW IF EXISTS public.public_suppliers_view;
DROP VIEW IF EXISTS public.public_platform_tenant_directory;
DROP TABLE IF EXISTS public.product;
DROP SEQUENCE IF EXISTS public.platform_tenant_id_seq;
DROP TABLE IF EXISTS public.platform_tenant;
DROP SEQUENCE IF EXISTS public.platform_suggestion_board_id_seq;
DROP TABLE IF EXISTS public.platform_suggestion_board;
DROP SEQUENCE IF EXISTS public.platform_standard_category_id_seq;
DROP TABLE IF EXISTS public.platform_standard_category;
DROP SEQUENCE IF EXISTS public.platform_membership_plan_id_seq;
DROP TABLE IF EXISTS public.platform_membership_plan;
DROP TABLE IF EXISTS public.platform_governance_config;
DROP TABLE IF EXISTS public.platform_gov_configs;
DROP SEQUENCE IF EXISTS public.platform_compliance_case_id_seq;
DROP TABLE IF EXISTS public.platform_compliance_case;
DROP TABLE IF EXISTS public.platform_category_dict;
DROP TABLE IF EXISTS public.platform_category;
DROP SEQUENCE IF EXISTS public.platform_admin_credential_id_seq;
DROP TABLE IF EXISTS public.platform_admin_credential;
DROP TABLE IF EXISTS public.payment_record;
DROP TABLE IF EXISTS public.orders;
DROP TABLE IF EXISTS public.order_item;
DROP TABLE IF EXISTS public.onboarding_query_guard;
DROP TABLE IF EXISTS public.login_qr_session;
DROP SEQUENCE IF EXISTS public.local_inventory_pool_id_seq;
DROP TABLE IF EXISTS public.local_inventory_pool;
DROP SEQUENCE IF EXISTS public.inventory_log_id_seq;
DROP TABLE IF EXISTS public.inventory_log;
DROP SEQUENCE IF EXISTS public.driver_id_seq;
DROP SEQUENCE IF EXISTS public.driver_collection_log_id_seq;
DROP TABLE IF EXISTS public.driver_collection_log;
DROP TABLE IF EXISTS public.driver;
DROP SEQUENCE IF EXISTS public.demand_forecast_plan_id_seq;
DROP TABLE IF EXISTS public.demand_forecast_plan;
DROP TABLE IF EXISTS public.auth_rate_limit;
DROP SEQUENCE IF EXISTS public.audit_immutable_log_id_seq;
DROP TABLE IF EXISTS public.audit_immutable_log;
DROP FUNCTION IF EXISTS public.submit_b2b_order(p_store_id bigint, p_items jsonb);
DROP FUNCTION IF EXISTS public.rpc_verify_and_query_onboarding(p_mode text, p_phone text, p_id_last6 text, p_cipher text, p_backup_phone text, p_company_name text);
DROP FUNCTION IF EXISTS public.rpc_sync_tenant_vault(p_tenant_id text, p_access_key text, p_backup_phone text);
DROP FUNCTION IF EXISTS public.rpc_submit_vendor_onboarding(p_resubmit_id bigint, p_tenant_id text, p_company_name text, p_credit_code text, p_contact_person text, p_contact_phone text, p_backup_phone text, p_sponsor_org text, p_business_type text, p_access_key text, p_is_manual_fallback boolean, p_audit_summary text, p_license_base64 text, p_is_claim_appeal boolean);
DROP FUNCTION IF EXISTS public.rpc_reject_timelock_recovery(p_tenant_id text, p_verify_proof text);
DROP FUNCTION IF EXISTS public.rpc_initiate_timelock_recovery(p_tenant_id text, p_credit_code text, p_phone text);
DROP FUNCTION IF EXISTS public.rpc_get_tenant_security_status(p_tenant_id text);
DROP FUNCTION IF EXISTS public.rpc_consume_recovery_code(p_tenant_id text, p_code_hash text);
DROP FUNCTION IF EXISTS public.rpc_complete_timelock_reset(p_tenant_id text, p_credit_code text, p_new_password text);
DROP FUNCTION IF EXISTS public.rpc_change_tenant_master_password(p_tenant_id text, p_old_password text, p_new_password text);
DROP FUNCTION IF EXISTS public.rpc_bump_session_epoch(p_tenant_id text, p_reason text);
DROP FUNCTION IF EXISTS public.rpc_bind_totp_and_recovery(p_tenant_id text, p_access_key text, p_totp_secret text, p_recovery_hashes jsonb);
DROP FUNCTION IF EXISTS public.prevent_physical_ledger_delete();
DROP FUNCTION IF EXISTS public.prevent_audit_log_mutation();
DROP FUNCTION IF EXISTS public.prevent_audit_log_modification();
DROP FUNCTION IF EXISTS public.internal_record_auth_result(p_key text, p_success boolean);
DROP FUNCTION IF EXISTS public.internal_check_rate_limit(p_key text);
DROP FUNCTION IF EXISTS public.get_route_wave_summary(p_route_name text);
DROP FUNCTION IF EXISTS public.forbid_audit_modification();
DROP FUNCTION IF EXISTS public.fn_guard_public_order_spam();
DROP FUNCTION IF EXISTS public.dispatch_route_orders(p_route_name text);
DROP FUNCTION IF EXISTS public.deliver_and_settle_order(p_order_id bigint, p_pay_method text, p_actual_amount numeric, p_reject_reason text, p_operator text);
DROP SCHEMA IF EXISTS public;
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: deliver_and_settle_order(bigint, text, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deliver_and_settle_order(p_order_id bigint, p_pay_method text, p_actual_amount numeric, p_reject_reason text DEFAULT NULL::text, p_operator text DEFAULT '送货司机'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_store store%ROWTYPE;
    v_diff NUMERIC(10,2);
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '订单不存在';
    END IF;

    SELECT * INTO v_store FROM store WHERE id = v_order.store_id FOR UPDATE;

    -- 处理现场缺货或拒收差额
    v_diff := v_order.total_amount - p_actual_amount;
    IF v_diff > 0 THEN
        -- 调减小店因原订单多计的挂账
        UPDATE store SET current_debt = GREATEST(0, current_debt - v_diff) WHERE id = v_store.id;
    END IF;

    -- 如果现场结清（现金或微信转账）
    IF p_pay_method IN ('CASH', 'WECHAT') THEN
        UPDATE orders 
        SET status = 'DELIVERED', pay_status = 'PAID', actual_amount = p_actual_amount, reject_reason = p_reject_reason 
        WHERE id = p_order_id;

        -- 扣减挂账
        UPDATE store SET current_debt = GREATEST(0, current_debt - p_actual_amount) WHERE id = v_store.id;

        -- 记录正式对账流水
        INSERT INTO payment_record (tenant_id, store_id, order_id, amount, pay_method, operator, remark)
        VALUES (v_order.tenant_id, v_store.id, p_order_id, p_actual_amount, p_pay_method, p_operator, p_reject_reason);
    ELSE
        -- 纯签收记挂账
        UPDATE orders 
        SET status = 'DELIVERED', pay_status = 'UNPAID', actual_amount = p_actual_amount, reject_reason = p_reject_reason 
        WHERE id = p_order_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: dispatch_route_orders(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_route_orders(p_route_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant_id TEXT;
  v_updated_count INT;
  v_store_count INT;
BEGIN
  v_tenant_id := current_setting('request.headers', true)::json->>'x-tenant-id';
  IF v_tenant_id IS NULL OR v_tenant_id = 'NO_TENANT_SPECIFIED' THEN
    RAISE EXCEPTION '非法请求：未指定租户身份';
  END IF;

  -- 统计影响门店数
  SELECT COUNT(DISTINCT store_id) INTO v_store_count
  FROM orders
  WHERE route_name = p_route_name 
    AND tenant_id = v_tenant_id 
    AND status = 'PENDING';

  -- 更新订单状态
  UPDATE orders
  SET status = 'DISPATCHED'
  WHERE route_name = p_route_name 
    AND tenant_id = v_tenant_id 
    AND status = 'PENDING';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'route_name', p_route_name,
    'order_count', v_updated_count,
    'store_count', v_store_count
  );
END;
$$;


--
-- Name: fn_guard_public_order_spam(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_guard_public_order_spam() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_recent_1min INT;
  v_recent_1day INT;
BEGIN
  -- 仅针对游客渠道（天街商城 & 名录预约线索）进行频率限制
  IF NEW.order_source IN ('mall_online', 'b2b_directory_lead') THEN
    
    -- 1. 检查同一联系人备注（含手机号）1 分钟内的提交次数
    SELECT COUNT(*) INTO v_recent_1min
    FROM public.store_order
    WHERE settlement_note = NEW.settlement_note
      AND created_at >= NOW() - INTERVAL '1 minute';

    IF v_recent_1min >= 3 THEN
      RAISE EXCEPTION '操作过于频繁，请 1 分钟后再试！';
    END IF;

    -- 2. 检查同一联系人备注 24 小时内的总提交次数
    SELECT COUNT(*) INTO v_recent_1day
    FROM public.store_order
    WHERE settlement_note = NEW.settlement_note
      AND created_at >= NOW() - INTERVAL '24 hours';

    IF v_recent_1day >= 20 THEN
      RAISE EXCEPTION '今日提交次数已达上限，如需加急请直接致电门店或供货方！';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: forbid_audit_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.forbid_audit_modification() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION '【天道明鑑】審計日誌記錄天理昭彰，數據庫觸發器已物理封死修改與刪除操作！';
END;
$$;


--
-- Name: get_route_wave_summary(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_route_wave_summary(p_route_name text) RETURNS TABLE(barcode text, product_name text, unit text, total_qty bigint)
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
    SELECT 
        oi.barcode,
        oi.product_name,
        oi.unit,
        SUM(oi.quantity) AS total_qty
    FROM order_item oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.route_name = p_route_name 
      AND o.status = 'SUBMITTED'
      AND o.tenant_id = COALESCE(current_setting('request.headers', true)::json->>'x-tenant-id', 'BJ_HQ')
    GROUP BY oi.barcode, oi.product_name, oi.unit
    ORDER BY total_qty DESC;
$$;


--
-- Name: internal_check_rate_limit(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.internal_check_rate_limit(p_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rec public.auth_rate_limit%ROWTYPE;
BEGIN
  SELECT * INTO v_rec FROM public.auth_rate_limit WHERE rate_key = p_key;
  IF FOUND AND v_rec.locked_until IS NOT NULL AND v_rec.locked_until > NOW() THEN
    RAISE EXCEPTION '安全熔断：核验连续失败次数过多，请于 % 后再试', TO_CHAR(v_rec.locked_until AT TIME ZONE 'Asia/Shanghai', 'HH24:MI:SS');
  END IF;
END;
$$;


--
-- Name: internal_record_auth_result(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.internal_record_auth_result(p_key text, p_success boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_fails INT;
BEGIN
  IF p_success THEN
    DELETE FROM public.auth_rate_limit WHERE rate_key = p_key;
    RETURN;
  END IF;

  INSERT INTO public.auth_rate_limit (rate_key, fail_count, updated_at)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (rate_key) DO UPDATE
    SET fail_count = public.auth_rate_limit.fail_count + 1,
        updated_at = NOW()
  RETURNING fail_count INTO v_fails;

  IF v_fails >= 5 THEN
    UPDATE public.auth_rate_limit
    SET locked_until = NOW() + INTERVAL '15 minutes'
    WHERE rate_key = p_key;
  END IF;
END;
$$;


--
-- Name: prevent_audit_log_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_audit_log_modification() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION '天道明鉴审计流水禁止修改或删除';
END;
$$;


--
-- Name: prevent_audit_log_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_audit_log_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION '天道明鉴审计流水受物理契约保护，严禁修改或删除历史记录！';
END;
$$;


--
-- Name: prevent_physical_ledger_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_physical_ledger_delete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION '【天道明鉴内核保护】核心账本表 (%) 禁止物理删除记录，请使用软归档 (is_archived = true) 操作！', TG_TABLE_NAME;
END;
$$;


--
-- Name: rpc_bind_totp_and_recovery(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_bind_totp_and_recovery(p_tenant_id text, p_access_key text, p_totp_secret text, p_recovery_hashes jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_vault public.tenant_security_vault%ROWTYPE;
BEGIN
  PERFORM public.internal_check_rate_limit('bind_totp:' || p_tenant_id);

  SELECT * INTO v_vault FROM public.tenant_security_vault WHERE tenant_id = p_tenant_id;
  IF NOT FOUND OR v_vault.access_key_hash <> p_access_key THEN
    PERFORM public.internal_record_auth_result('bind_totp:' || p_tenant_id, FALSE);
    RETURN jsonb_build_object('ok', false, 'error', '安家主密码核验未通过');
  END IF;

  PERFORM public.internal_record_auth_result('bind_totp:' || p_tenant_id, TRUE);

  UPDATE public.tenant_security_vault
  SET totp_secret = p_totp_secret,
      totp_enabled = TRUE,
      recovery_code_hashes = COALESCE(p_recovery_hashes, '[]'::jsonb),
      updated_at = NOW()
  WHERE tenant_id = p_tenant_id;

  UPDATE public.platform_tenant
  SET totp_enabled = TRUE
  WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: rpc_bump_session_epoch(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_bump_session_epoch(p_tenant_id text, p_reason text DEFAULT '手动清退其他登录终端'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_next_epoch INT;
BEGIN
  UPDATE public.tenant_security_vault
  SET session_epoch = COALESCE(session_epoch, 1) + 1,
      updated_at = NOW()
  WHERE tenant_id = p_tenant_id
  RETURNING session_epoch INTO v_next_epoch;

  UPDATE public.platform_tenant
  SET session_epoch = v_next_epoch
  WHERE tenant_id = p_tenant_id;

  INSERT INTO public.audit_immutable_log (tenant_id, operator_name, action_level, action_title, action_details)
  VALUES (p_tenant_id, '安全护航内核', 'WARN', '触发全网会话纪元递增清退旧终端', jsonb_build_object('new_epoch', v_next_epoch, 'reason', p_reason));

  RETURN jsonb_build_object('ok', true, 'session_epoch', v_next_epoch);
END;
$$;


--
-- Name: rpc_change_tenant_master_password(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_change_tenant_master_password(p_tenant_id text, p_old_password text, p_new_password text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_vault public.tenant_security_vault%ROWTYPE;
  v_next_epoch INT;
BEGIN
  PERFORM public.internal_check_rate_limit('chg_pwd:' || p_tenant_id);

  SELECT * INTO v_vault FROM public.tenant_security_vault WHERE tenant_id = p_tenant_id;
  IF NOT FOUND OR v_vault.access_key_hash <> p_old_password THEN
    PERFORM public.internal_record_auth_result('chg_pwd:' || p_tenant_id, FALSE);
    RETURN jsonb_build_object('ok', false, 'error', '原安家主密码错误');
  END IF;

  PERFORM public.internal_record_auth_result('chg_pwd:' || p_tenant_id, TRUE);
  v_next_epoch := COALESCE(v_vault.session_epoch, 1) + 1;

  UPDATE public.tenant_security_vault
  SET access_key_hash = p_new_password,
      session_epoch = v_next_epoch,
      updated_at = NOW()
  WHERE tenant_id = p_tenant_id;

  UPDATE public.platform_tenant
  SET access_key = p_new_password,
      session_epoch = v_next_epoch
  WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'session_epoch', v_next_epoch);
END;
$$;


--
-- Name: rpc_complete_timelock_reset(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_complete_timelock_reset(p_tenant_id text, p_credit_code text, p_new_password text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant public.platform_tenant%ROWTYPE;
  v_vault public.tenant_security_vault%ROWTYPE;
  v_next_epoch INT;
BEGIN
  SELECT * INTO v_tenant FROM public.platform_tenant WHERE tenant_id = UPPER(TRIM(p_tenant_id));
  SELECT * INTO v_vault FROM public.tenant_security_vault WHERE tenant_id = UPPER(TRIM(p_tenant_id));

  IF NOT FOUND OR v_vault.timelock_status NOT IN ('pending', 'ready') THEN
    RETURN jsonb_build_object('ok', false, 'error', '当前商号不存在进行中的时间锁申请');
  END IF;

  IF NOW() < v_vault.timelock_expires_at THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', '72 小时安全观察期尚未届满，服务端解锁时间为：' || TO_CHAR(v_vault.timelock_expires_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS')
    );
  END IF;

  IF UPPER(TRIM(COALESCE(v_tenant.credit_code, ''))) <> UPPER(TRIM(p_credit_code)) THEN
    RETURN jsonb_build_object('ok', false, 'error', '18位法定证件全号核验不一致');
  END IF;

  v_next_epoch := COALESCE(v_vault.session_epoch, 1) + 1;

  UPDATE public.tenant_security_vault
  SET access_key_hash = p_new_password,
      totp_enabled = FALSE,
      totp_secret = NULL,
      timelock_status = 'none',
      timelock_started_at = NULL,
      timelock_expires_at = NULL,
      session_epoch = v_next_epoch,
      updated_at = NOW()
  WHERE tenant_id = v_tenant.tenant_id;

  UPDATE public.platform_tenant
  SET access_key = p_new_password,
      totp_enabled = FALSE,
      totp_secret = NULL,
      timelock_status = 'none',
      timelock_expires_at = NULL,
      session_epoch = v_next_epoch
  WHERE tenant_id = v_tenant.tenant_id;

  INSERT INTO public.audit_immutable_log (tenant_id, operator_name, action_level, action_title, action_details)
  VALUES (v_tenant.tenant_id, '72小时时间锁自动核发', 'CRITICAL', '时间锁届满已重置主密码并清退旧终端', jsonb_build_object('new_epoch', v_next_epoch));

  RETURN jsonb_build_object('ok', true, 'session_epoch', v_next_epoch);
END;
$$;


--
-- Name: rpc_consume_recovery_code(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_consume_recovery_code(p_tenant_id text, p_code_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_vault public.tenant_security_vault%ROWTYPE;
  v_new_hashes JSONB;
  v_old_len INT;
  v_new_len INT;
BEGIN
  PERFORM public.internal_check_rate_limit('recovery:' || p_tenant_id);

  SELECT * INTO v_vault FROM public.tenant_security_vault WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '商号安全档案不存在');
  END IF;

  v_old_len := jsonb_array_length(COALESCE(v_vault.recovery_code_hashes, '[]'::jsonb));
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  INTO v_new_hashes
  FROM jsonb_array_elements_text(COALESCE(v_vault.recovery_code_hashes, '[]'::jsonb)) AS elem
  WHERE elem <> p_code_hash;

  v_new_len := jsonb_array_length(v_new_hashes);

  IF v_new_len = v_old_len THEN
    PERFORM public.internal_record_auth_result('recovery:' || p_tenant_id, FALSE);
    RETURN jsonb_build_object('ok', false, 'error', '该应急恢复码无效或已被核销作废');
  END IF;

  PERFORM public.internal_record_auth_result('recovery:' || p_tenant_id, TRUE);

  UPDATE public.tenant_security_vault
  SET recovery_code_hashes = v_new_hashes,
      updated_at = NOW()
  WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'remaining', v_new_len);
END;
$$;


--
-- Name: rpc_get_tenant_security_status(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_tenant_security_status(p_tenant_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_vault public.tenant_security_vault%ROWTYPE;
  v_tenant public.platform_tenant%ROWTYPE;
BEGIN
  SELECT * INTO v_tenant FROM public.platform_tenant WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '商号不存在');
  END IF;

  INSERT INTO public.tenant_security_vault (tenant_id, access_key_hash, backup_phone, totp_secret, totp_enabled, reset_claim_token)
  VALUES (v_tenant.tenant_id, v_tenant.access_key, v_tenant.backup_phone, v_tenant.totp_secret, COALESCE(v_tenant.totp_enabled, FALSE), v_tenant.reset_claim_token)
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT * INTO v_vault FROM public.tenant_security_vault WHERE tenant_id = p_tenant_id;

  IF v_vault.timelock_status = 'pending' AND v_vault.timelock_expires_at <= NOW() THEN
    UPDATE public.tenant_security_vault
    SET timelock_status = 'ready', updated_at = NOW()
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO v_vault;

    UPDATE public.platform_tenant
    SET timelock_status = 'ready'
    WHERE tenant_id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'totp_enabled', COALESCE(v_vault.totp_enabled, FALSE),
    'recovery_codes_remaining', jsonb_array_length(COALESCE(v_vault.recovery_code_hashes, '[]'::jsonb)),
    'session_epoch', COALESCE(v_vault.session_epoch, 1),
    'timelock_status', COALESCE(v_vault.timelock_status, 'none'),
    'timelock_expires_at', v_vault.timelock_expires_at,
    'has_backup_phone', (v_vault.backup_phone IS NOT NULL AND LENGTH(v_vault.backup_phone) >= 7)
  );
END;
$$;


--
-- Name: rpc_initiate_timelock_recovery(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_initiate_timelock_recovery(p_tenant_id text, p_credit_code text, p_phone text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant public.platform_tenant%ROWTYPE;
  v_vault public.tenant_security_vault%ROWTYPE;
  v_expires TIMESTAMPTZ;
BEGIN
  PERFORM public.internal_check_rate_limit('timelock_init:' || p_tenant_id);

  SELECT * INTO v_tenant FROM public.platform_tenant WHERE tenant_id = UPPER(TRIM(p_tenant_id));
  IF NOT FOUND THEN
    PERFORM public.internal_record_auth_result('timelock_init:' || p_tenant_id, FALSE);
    RETURN jsonb_build_object('ok', false, 'error', '未检索到该商号代号');
  END IF;

  SELECT * INTO v_vault FROM public.tenant_security_vault WHERE tenant_id = v_tenant.tenant_id;

  IF v_vault.timelock_cooldown_until IS NOT NULL AND v_vault.timelock_cooldown_until > NOW() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', '该商号近期已驳回过自助找回申请，处于 7 天防骚扰冷却期内；如确属本人急用，请联系平台总控走线下公章加急通道。'
    );
  END IF;

  IF UPPER(TRIM(COALESCE(v_tenant.credit_code, ''))) <> UPPER(TRIM(p_credit_code))
     OR (TRIM(COALESCE(v_tenant.phone, '')) <> TRIM(p_phone) AND TRIM(COALESCE(v_vault.backup_phone, '')) <> TRIM(p_phone)) THEN
    PERFORM public.internal_record_auth_result('timelock_init:' || p_tenant_id, FALSE);
    RETURN jsonb_build_object('ok', false, 'error', '18位法定证件全号或登记的主/备手机号核验不匹配');
  END IF;

  PERFORM public.internal_record_auth_result('timelock_init:' || p_tenant_id, TRUE);

  v_expires := NOW() + INTERVAL '72 hours';

  UPDATE public.tenant_security_vault
  SET timelock_status = 'pending',
      timelock_started_at = NOW(),
      timelock_expires_at = v_expires,
      timelock_requester_info = LEFT(TRIM(p_phone), 3) || '****' || RIGHT(TRIM(p_phone), 4),
      updated_at = NOW()
  WHERE tenant_id = v_tenant.tenant_id;

  UPDATE public.platform_tenant
  SET timelock_status = 'pending',
      timelock_expires_at = v_expires
  WHERE tenant_id = v_tenant.tenant_id;

  INSERT INTO public.audit_immutable_log (tenant_id, operator_name, action_level, action_title, action_details)
  VALUES (v_tenant.tenant_id, '门外自助找回网关', 'CRITICAL', '发起 72 小时无人值守时间锁重置（进入观察期写保护）', jsonb_build_object('expires_at', v_expires));

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', v_tenant.tenant_id,
    'company_name', v_tenant.company_name,
    'expires_at', v_expires
  );
END;
$$;


--
-- Name: rpc_reject_timelock_recovery(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_reject_timelock_recovery(p_tenant_id text, p_verify_proof text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.tenant_security_vault
  SET timelock_status = 'none',
      timelock_started_at = NULL,
      timelock_expires_at = NULL,
      timelock_cooldown_until = NOW() + INTERVAL '7 days',
      updated_at = NOW()
  WHERE tenant_id = p_tenant_id;

  UPDATE public.platform_tenant
  SET timelock_status = 'none',
      timelock_expires_at = NULL
  WHERE tenant_id = p_tenant_id;

  INSERT INTO public.audit_immutable_log (tenant_id, operator_name, action_level, action_title, action_details)
  VALUES (p_tenant_id, '当家护盘核验', 'WARN', '已驳回 72 小时时间锁重置并开启 7 天冷却期', jsonb_build_object('proof', p_verify_proof));

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: rpc_submit_vendor_onboarding(bigint, text, text, text, text, text, text, text, text, text, boolean, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_submit_vendor_onboarding(p_resubmit_id bigint, p_tenant_id text, p_company_name text, p_credit_code text, p_contact_person text, p_contact_phone text, p_backup_phone text, p_sponsor_org text, p_business_type text, p_access_key text, p_is_manual_fallback boolean, p_audit_summary text, p_license_base64 text, p_is_claim_appeal boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_existing_tenant record;
  v_app_status text;
  v_audit_score integer;
  v_final_note text;
BEGIN
  IF trim(coalesce(p_credit_code, '')) = '' OR length(trim(p_credit_code)) <> 18 THEN
    RETURN jsonb_build_object('ok', false, 'msg', '统一社会信用代码或身份证号必须为18位');
  END IF;

  IF trim(coalesce(p_contact_phone, '')) !~ '^1\d{10}$' OR trim(coalesce(p_backup_phone, '')) !~ '^1\d{10}$' THEN
    RETURN jsonb_build_object('ok', false, 'msg', '主联络手机与紧急备用手机均须为11位有效手机号');
  END IF;

  IF trim(p_contact_phone) = trim(p_backup_phone) THEN
    RETURN jsonb_build_object('ok', false, 'msg', '紧急备用手机号不可与主联络手机号相同');
  END IF;

  -- 全周期一证一户防抢注检测：无论试用期还是已转正，正主均可随时发起抢注申诉
  IF p_resubmit_id IS NULL THEN
    SELECT tenant_id, company_name, membership_status, is_active
    INTO v_existing_tenant
    FROM public.platform_tenant
    WHERE credit_code = upper(trim(p_credit_code))
    LIMIT 1;

    IF FOUND AND NOT coalesce(p_is_claim_appeal, false) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'CAN_APPEAL_CLAIM',
        'existing_tenant_id', v_existing_tenant.tenant_id,
        'existing_company', v_existing_tenant.company_name,
        'msg', format(
          '检测到该证件【%s】已在册（商号：%s，状态：%s）。如您系该主体法定负责人且账号被他人抢注占用，可点击确定发起【正主抢注申诉】交由平台总控人工核实裁决！',
          v_existing_tenant.company_name,
          v_existing_tenant.tenant_id,
          coalesce(v_existing_tenant.membership_status, 'active')
        )
      );
    END IF;
  END IF;

  -- 抢注申诉一律强制进入人工终审队列，不自动覆盖原账号
  IF coalesce(p_is_claim_appeal, false) THEN
    v_app_status := 'pending_review';
    v_audit_score := 50;
    v_final_note := format('⚠️【疑似抢注申诉·待总控电话核实正主】%s', p_audit_summary);
  ELSE
    v_app_status := CASE WHEN p_is_manual_fallback THEN 'pending_review' ELSE 'approved_by_ai' END;
    v_audit_score := CASE WHEN p_is_manual_fallback THEN 65 ELSE 98 END;
    v_final_note := CASE WHEN p_resubmit_id IS NOT NULL THEN format('【补件重提】%s', p_audit_summary) ELSE p_audit_summary END;
  END IF;

  IF p_resubmit_id IS NOT NULL THEN
    UPDATE public.tenant_application
    SET company_name = trim(p_company_name),
        credit_code = upper(trim(p_credit_code)),
        contact_person = trim(p_contact_person),
        contact_phone = trim(p_contact_phone),
        business_type = p_business_type,
        access_key = p_access_key,
        application_status = v_app_status,
        ai_audit_score = v_audit_score,
        review_note = v_final_note,
        license_image_url = p_license_base64
    WHERE id = p_resubmit_id;
  ELSE
    INSERT INTO public.tenant_application (
      tenant_id, company_name, credit_code, contact_person, contact_phone,
      business_type, service_mode, access_key, application_status,
      ai_audit_score, review_note, license_image_url
    ) VALUES (
      upper(trim(p_tenant_id)), trim(p_company_name), upper(trim(p_credit_code)),
      trim(p_contact_person), trim(p_contact_phone), p_business_type,
      '实体与电商双轨', p_access_key, v_app_status,
      v_audit_score, v_final_note, p_license_base64
    );
  END IF;

  -- 仅 AI 绿灯直通且非抢注申诉时，原子化自动开通7天尝鲜席位
  IF v_app_status = 'approved_by_ai' THEN
    INSERT INTO public.platform_tenant (
      tenant_id, company_name, credit_code, business_type, service_mode,
      contact_person, contact_name, phone, backup_phone, sponsor_org,
      access_key, membership_status, is_active, permit_brick_and_mortar,
      permit_ecommerce, valid_until
    ) VALUES (
      upper(trim(p_tenant_id)), trim(p_company_name), upper(trim(p_credit_code)),
      p_business_type, '实体与电商双轨', trim(p_contact_person), trim(p_contact_person),
      trim(p_contact_phone), trim(p_backup_phone), nullif(trim(coalesce(p_sponsor_org, '')), ''),
      p_access_key, 'trial', true, true, true, (current_date + interval '7 days')::date
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      company_name = EXCLUDED.company_name,
      credit_code = EXCLUDED.credit_code,
      contact_person = EXCLUDED.contact_person,
      contact_name = EXCLUDED.contact_name,
      phone = EXCLUDED.phone,
      backup_phone = EXCLUDED.backup_phone,
      sponsor_org = EXCLUDED.sponsor_org,
      access_key = EXCLUDED.access_key,
      membership_status = 'trial',
      is_active = true,
      valid_until = EXCLUDED.valid_until;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_app_status,
    'tenant_id', upper(trim(p_tenant_id))
  );
END;
$_$;


--
-- Name: rpc_sync_tenant_vault(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_sync_tenant_vault(p_tenant_id text, p_access_key text, p_backup_phone text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.tenant_security_vault (tenant_id, access_key_hash, backup_phone)
  VALUES (p_tenant_id, p_access_key, p_backup_phone)
  ON CONFLICT (tenant_id) DO UPDATE
    SET backup_phone = COALESCE(NULLIF(p_backup_phone, ''), public.tenant_security_vault.backup_phone),
        updated_at = NOW();

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: rpc_verify_and_query_onboarding(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_verify_and_query_onboarding(p_mode text, p_phone text, p_id_last6 text, p_cipher text DEFAULT ''::text, p_backup_phone text DEFAULT ''::text, p_company_name text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_guard record;
  v_clean_phone text := trim(coalesce(p_phone, ''));
  v_clean_last6 text := upper(trim(coalesce(p_id_last6, '')));
  v_clean_cipher text := upper(trim(coalesce(p_cipher, '')));
  v_clean_backup text := trim(coalesce(p_backup_phone, ''));
  v_clean_name text := trim(coalesce(p_company_name, ''));
  v_apps jsonb;
  v_new_fail integer;
BEGIN
  IF v_clean_phone !~ '^1\d{10}$' OR length(v_clean_last6) <> 6 THEN
    RETURN jsonb_build_object('ok', false, 'msg', '请输入完整的11位主联络手机号与6位证件后缀');
  END IF;

  -- 检查数据库级24小时熔断锁定
  SELECT * INTO v_guard FROM public.onboarding_query_guard WHERE phone = v_clean_phone;
  IF FOUND AND v_guard.locked_until IS NOT NULL AND now() < v_guard.locked_until THEN
    RETURN jsonb_build_object(
      'ok', false,
      'locked', true,
      'msg', '⚠️ 该手机号连续核身输错已达 5 次，数据库已自动锁定查询通道 24 小时防冒领！如需加急请致电平台总控。'
    );
  END IF;

  IF p_mode = 'emergency' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id DESC), '[]'::jsonb)
    INTO v_apps
    FROM public.tenant_application t
    WHERE t.contact_phone = v_clean_phone
      AND right(upper(trim(coalesce(t.credit_code, ''))), 6) = v_clean_last6
      AND trim(coalesce(t.company_name, '')) = v_clean_name
      AND (
        t.review_note !~ '\[备用手机[:：]\d{11}\]'
        OR t.review_note ~ format('\[备用手机[:：]%s\]', v_clean_backup)
      );
  ELSE
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id DESC), '[]'::jsonb)
    INTO v_apps
    FROM public.tenant_application t
    WHERE t.contact_phone = v_clean_phone
      AND right(upper(trim(coalesce(t.credit_code, ''))), 6) = v_clean_last6
      AND (
        t.review_note !~* '\[查验暗号[:：][A-Z0-9-]+\]'
        OR upper(t.review_note) ~ format('\[查验暗号[:：]%s\]', v_clean_cipher)
      );
  END IF;

  IF jsonb_array_length(v_apps) = 0 THEN
    INSERT INTO public.onboarding_query_guard (phone, fail_count, locked_until)
    VALUES (v_clean_phone, 1, NULL)
    ON CONFLICT (phone) DO UPDATE SET
      fail_count = CASE
        WHEN onboarding_query_guard.locked_until IS NOT NULL AND now() >= onboarding_query_guard.locked_until THEN 1
        ELSE onboarding_query_guard.fail_count + 1
      END,
      locked_until = CASE
        WHEN (CASE WHEN onboarding_query_guard.locked_until IS NOT NULL AND now() >= onboarding_query_guard.locked_until THEN 1 ELSE onboarding_query_guard.fail_count + 1 END) >= 5
        THEN now() + interval '24 hours'
        ELSE NULL
      END
    RETURNING fail_count INTO v_new_fail;

    RETURN jsonb_build_object(
      'ok', false,
      'fail_count', v_new_fail,
      'remain', greatest(0, 5 - v_new_fail),
      'msg', format('核身信息不匹配（今日剩余试错 %s 次，满 5 次将库级锁定 24 小时）', greatest(0, 5 - v_new_fail))
    );
  END IF;

  -- 核身成功，清零错误计数
  DELETE FROM public.onboarding_query_guard WHERE phone = v_clean_phone;

  RETURN jsonb_build_object('ok', true, 'apps', v_apps);
END;
$_$;


--
-- Name: submit_b2b_order(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_b2b_order(p_store_id bigint, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant_id TEXT;
  v_credit_limit NUMERIC;
  v_current_debt NUMERIC;
  v_store_name TEXT;
  v_route_name TEXT;
  v_total_amount NUMERIC := 0;
  v_order_id BIGINT;
  v_order_no TEXT;
  v_item JSONB;
  v_prod_id BIGINT;
  v_req_qty INT;
  v_current_stock INT;
  v_unit_price NUMERIC;
BEGIN
  -- 获取当前请求 Header 注入的租户 ID
  v_tenant_id := current_setting('request.headers', true)::json->>'x-tenant-id';
  IF v_tenant_id IS NULL OR v_tenant_id = 'NO_TENANT_SPECIFIED' THEN
    RAISE EXCEPTION '非法请求：未指定有效的租户身份';
  END IF;

  -- 锁定门店行，防止并发超授信下单
  SELECT name, route_name, credit_limit, current_debt
  INTO v_store_name, v_route_name, v_credit_limit, v_current_debt
  FROM store
  WHERE id = p_store_id AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '未找到指定门店或无权访问该租户门店';
  END IF;

  -- 预先计算订单总金额并校验库存行级悲观锁 (FOR UPDATE)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'product_id')::BIGINT;
    v_req_qty := (v_item->>'quantity')::INT;
    v_unit_price := (v_item->>'price')::NUMERIC;

    -- 锁定商品行
    SELECT stock INTO v_current_stock
    FROM product
    WHERE id = v_prod_id AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '商品不存在或已下架 (ID: %)', v_prod_id;
    END IF;

    IF v_current_stock < v_req_qty THEN
      RAISE EXCEPTION '库存不足：【%】剩余现货仅 % 件，加购失败', (v_item->>'name'), v_current_stock;
    END IF;

    v_total_amount := v_total_amount + (v_unit_price * v_req_qty);
  END LOOP;

  -- 授信硬指标严格阻断
  IF (v_current_debt + v_total_amount) > v_credit_limit THEN
    RAISE EXCEPTION '已触发授信红线！当前欠款 ¥%，下单后总金额达 ¥%，超出额度限制 ¥%，请联系财务结算后再下单',
      v_current_debt, (v_current_debt + v_total_amount), v_credit_limit;
  END IF;

  -- 扣减锁定的库存
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE product
    SET stock = stock - (v_item->>'quantity')::INT
    WHERE id = (v_item->>'product_id')::BIGINT AND tenant_id = v_tenant_id;
  END LOOP;

  -- 更新门店挂账欠款
  UPDATE store
  SET current_debt = current_debt + v_total_amount
  WHERE id = p_store_id;

  -- 生成订单
  v_order_no := 'ORD-' || to_char(NOW(), 'YYYYMMDD-HH24MISS') || '-' || floor(random()*900 + 100)::TEXT;

  INSERT INTO orders (
    tenant_id, order_no, store_id, store_name, route_name,
    total_amount, actual_amount, status, pay_status, items
  ) VALUES (
    v_tenant_id, v_order_no, p_store_id, v_store_name, v_route_name,
    v_total_amount, v_total_amount, 'PENDING', 'UNPAID', p_items
  ) RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_no', v_order_no,
    'total_amount', v_total_amount,
    'current_debt', v_current_debt + v_total_amount
  );
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_immutable_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_immutable_log (
    id bigint NOT NULL,
    tenant_id text DEFAULT 'PLATFORM'::text,
    operator_account text NOT NULL,
    operator_name text NOT NULL,
    action_level text DEFAULT 'INFO'::text,
    action_title text NOT NULL,
    action_details jsonb DEFAULT '{}'::jsonb,
    client_ip text DEFAULT '127.0.0.1'::text,
    tamper_seal text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_immutable_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_immutable_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_immutable_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_immutable_log_id_seq OWNED BY public.audit_immutable_log.id;


--
-- Name: auth_rate_limit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_rate_limit (
    rate_key text NOT NULL,
    fail_count integer DEFAULT 0,
    locked_until timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: demand_forecast_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demand_forecast_plan (
    id bigint NOT NULL,
    tenant_id text NOT NULL,
    store_id bigint NOT NULL,
    store_name text NOT NULL,
    plan_cycle text DEFAULT '未来3日用度'::text,
    expected_date date,
    items jsonb DEFAULT '[]'::jsonb,
    note text,
    status text DEFAULT 'submitted'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: demand_forecast_plan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.demand_forecast_plan_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: demand_forecast_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.demand_forecast_plan_id_seq OWNED BY public.demand_forecast_plan.id;


--
-- Name: driver; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.driver (
    id integer NOT NULL,
    tenant_id character varying(50) NOT NULL,
    name character varying(50) NOT NULL,
    phone character varying(20) NOT NULL,
    route_name character varying(50) DEFAULT '城東A線'::character varying,
    status character varying(20) DEFAULT '在崗'::character varying
);


--
-- Name: driver_collection_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.driver_collection_log (
    id integer NOT NULL,
    tenant_id character varying(50) NOT NULL,
    store_id integer NOT NULL,
    store_name character varying(100) NOT NULL,
    driver_name character varying(50) NOT NULL,
    collect_type character varying(20) DEFAULT 'order_delivery'::character varying,
    amount numeric(10,2) NOT NULL,
    discount_amount numeric(10,2) DEFAULT 0.00,
    pay_method character varying(20) DEFAULT '现金'::character varying,
    sign_image_url text,
    settled_to_hq boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    basket_return integer DEFAULT 0,
    basket_deduct_amount numeric(10,2) DEFAULT 0.00,
    client_tx_uuid text
);


--
-- Name: driver_collection_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.driver_collection_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: driver_collection_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.driver_collection_log_id_seq OWNED BY public.driver_collection_log.id;


--
-- Name: driver_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.driver_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: driver_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.driver_id_seq OWNED BY public.driver.id;


--
-- Name: inventory_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_log (
    id bigint NOT NULL,
    tenant_id text NOT NULL,
    product_id bigint NOT NULL,
    product_name text NOT NULL,
    action_type text NOT NULL,
    delta_qty integer NOT NULL,
    before_stock integer NOT NULL,
    after_stock integer NOT NULL,
    operator_name text DEFAULT '掌櫃/倉管'::text,
    remark text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: inventory_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_log_id_seq OWNED BY public.inventory_log.id;


--
-- Name: local_inventory_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.local_inventory_pool (
    id bigint NOT NULL,
    tenant_id text NOT NULL,
    from_store_id bigint NOT NULL,
    from_store_name text NOT NULL,
    to_store_id bigint,
    to_store_name text,
    product_id bigint,
    product_name text NOT NULL,
    spec text,
    measure_unit text DEFAULT '件'::text,
    qty integer DEFAULT 1 NOT NULL,
    transfer_price numeric(10,2) DEFAULT 0,
    reason text,
    driver_name text,
    status text DEFAULT 'open'::text,
    created_at timestamp with time zone DEFAULT now(),
    claimed_at timestamp with time zone,
    completed_at timestamp with time zone
);


--
-- Name: local_inventory_pool_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.local_inventory_pool_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: local_inventory_pool_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.local_inventory_pool_id_seq OWNED BY public.local_inventory_pool.id;


--
-- Name: login_qr_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_qr_session (
    session_token text NOT NULL,
    tenant_id text,
    role_code text DEFAULT 'owner'::text,
    operator_name text,
    status text DEFAULT 'waiting'::text,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '00:01:30'::interval)
);


--
-- Name: onboarding_query_guard; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_query_guard (
    phone text NOT NULL,
    fail_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone
);


--
-- Name: order_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_item (
    id bigint NOT NULL,
    order_id bigint,
    product_id bigint,
    product_name text NOT NULL,
    barcode text,
    unit text,
    price numeric(10,2) NOT NULL,
    quantity integer NOT NULL,
    amount numeric(10,2) NOT NULL
);


--
-- Name: order_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_item ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.order_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id bigint NOT NULL,
    tenant_id text DEFAULT 'BJ_HQ'::text NOT NULL,
    order_no text NOT NULL,
    store_id bigint,
    store_name text,
    route_name text,
    total_amount numeric(10,2) NOT NULL,
    status text DEFAULT 'SUBMITTED'::text,
    pay_status text DEFAULT 'UNPAID'::text,
    delivery_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    actual_amount numeric(10,2),
    reject_reason text
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.orders ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payment_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_record (
    id bigint NOT NULL,
    tenant_id text DEFAULT 'BJ_HQ'::text NOT NULL,
    store_id bigint,
    order_id bigint,
    amount numeric(10,2) NOT NULL,
    pay_method text NOT NULL,
    operator text DEFAULT '送货司机'::text,
    remark text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: payment_record_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payment_record ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.payment_record_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: platform_admin_credential; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admin_credential (
    id bigint NOT NULL,
    admin_account text NOT NULL,
    secret_token text NOT NULL,
    admin_name text DEFAULT '平台总控调度官'::text,
    wx_openid text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    totp_secret text,
    totp_enabled boolean DEFAULT false,
    admin_role text DEFAULT 'admin_chief'::text
);


--
-- Name: platform_admin_credential_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_admin_credential_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_admin_credential_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_admin_credential_id_seq OWNED BY public.platform_admin_credential.id;


--
-- Name: platform_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_category (
    id bigint NOT NULL,
    name text NOT NULL,
    level integer DEFAULT 1,
    parent_id bigint,
    applicable_mode text DEFAULT 'both'::text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);


--
-- Name: platform_category_dict; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_category_dict (
    id bigint NOT NULL,
    category_name text NOT NULL,
    sort_order integer DEFAULT 99,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_category_dict_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.platform_category_dict ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.platform_category_dict_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: platform_category_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.platform_category ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.platform_category_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: platform_compliance_case; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_compliance_case (
    id bigint NOT NULL,
    case_type text NOT NULL,
    tenant_id text NOT NULL,
    company_name text,
    target_ref_id text,
    target_title text,
    ai_findings text NOT NULL,
    status text DEFAULT 'pending_appeal'::text,
    merchant_appeal_note text,
    merchant_evidence_url text,
    arbiter_notes text,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone
);


--
-- Name: platform_compliance_case_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_compliance_case_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_compliance_case_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_compliance_case_id_seq OWNED BY public.platform_compliance_case.id;


--
-- Name: platform_gov_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_gov_configs (
    config_key text NOT NULL,
    config_value text NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_governance_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_governance_config (
    config_key text NOT NULL,
    config_label text NOT NULL,
    config_value text NOT NULL,
    value_type text DEFAULT 'text'::text,
    category text DEFAULT 'general'::text,
    description text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_membership_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_membership_plan (
    id bigint NOT NULL,
    plan_code text NOT NULL,
    plan_name text NOT NULL,
    tagline text,
    fee_amount numeric(10,2) DEFAULT 0,
    billing_cycle text DEFAULT 'yearly'::text,
    max_staff_accounts integer DEFAULT 3,
    max_partner_stations integer DEFAULT 10,
    enabled_modules jsonb DEFAULT '["goods_basic", "order_ledger", "plan_schedule", "idle_share", "barter_exchange", "data_export"]'::jsonb,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 10,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_membership_plan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_membership_plan_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_membership_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_membership_plan_id_seq OWNED BY public.platform_membership_plan.id;


--
-- Name: platform_standard_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_standard_category (
    id bigint NOT NULL,
    level integer DEFAULT 1,
    parent_id bigint,
    category_name text NOT NULL,
    suggested_tags text DEFAULT ''::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_standard_category_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_standard_category_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_standard_category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_standard_category_id_seq OWNED BY public.platform_standard_category.id;


--
-- Name: platform_suggestion_board; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_suggestion_board (
    id bigint NOT NULL,
    proposer_type text NOT NULL,
    proposer_name text NOT NULL,
    proposer_phone text,
    category text DEFAULT '功能建议'::text,
    content text NOT NULL,
    reply_status text DEFAULT 'pending'::text,
    official_reply text,
    replied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_suggestion_board_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_suggestion_board_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_suggestion_board_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_suggestion_board_id_seq OWNED BY public.platform_suggestion_board.id;


--
-- Name: platform_tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_tenant (
    id integer NOT NULL,
    tenant_id character varying(50) NOT NULL,
    company_name character varying(100) NOT NULL,
    contact_name character varying(50),
    phone character varying(20),
    invite_code character varying(10),
    tier character varying(20) DEFAULT 'pro'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    expire_date date DEFAULT (CURRENT_DATE + '1 year'::interval),
    max_stores integer DEFAULT 200,
    created_at timestamp with time zone DEFAULT now(),
    entity_type character varying(20) DEFAULT 'dealer'::character varying,
    contact_phone text,
    contact_mobile text,
    contact_person text,
    business_type text DEFAULT 'dealer'::text NOT NULL,
    service_mode text DEFAULT 'offline'::text,
    membership_tier text DEFAULT 'standard'::text,
    membership_fee numeric(10,2) DEFAULT 0.00,
    is_active boolean DEFAULT true,
    access_key text DEFAULT '123456'::text,
    wx_openid text,
    wx_nickname text,
    totp_secret text,
    totp_enabled boolean DEFAULT false,
    membership_status text DEFAULT 'active'::text,
    reset_claim_token text,
    brand_origin_desc text DEFAULT '匠心传承 · 正品可溯'::text,
    permit_brick_and_mortar boolean DEFAULT true,
    permit_ecommerce boolean DEFAULT true,
    credit_code text,
    valid_until date,
    ai_audit_score numeric DEFAULT 0,
    ai_audit_log text,
    webhook_url text DEFAULT ''::text,
    media_url text,
    region text,
    address text,
    intro text,
    custom_settings jsonb DEFAULT '{}'::jsonb,
    backup_phone text,
    sponsor_org text,
    license_url text,
    id_card_url text,
    admin_remark text,
    session_epoch integer DEFAULT 1,
    timelock_status text DEFAULT 'none'::text,
    timelock_expires_at timestamp with time zone
);


--
-- Name: platform_tenant_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_tenant_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_tenant_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_tenant_id_seq OWNED BY public.platform_tenant.id;


--
-- Name: product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product (
    id bigint NOT NULL,
    tenant_id text DEFAULT 'BJ_HQ'::text NOT NULL,
    barcode text,
    name text NOT NULL,
    spec text NOT NULL,
    pack_unit text DEFAULT '箱'::text,
    tier_1_price numeric(10,2) NOT NULL,
    tier_2_price numeric(10,2) DEFAULT 0.00,
    stock_qty integer DEFAULT 9999,
    created_at timestamp with time zone DEFAULT now(),
    stock integer DEFAULT 999,
    category character varying(50) DEFAULT '休閒食品'::character varying,
    category_main character varying(50) DEFAULT '休閒食品'::character varying,
    category_sub character varying(50) DEFAULT '膨化/餅乾'::character varying,
    image_url text DEFAULT ''::text,
    status character varying(20) DEFAULT 'active'::character varying,
    remark text DEFAULT ''::text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    tags text[] DEFAULT '{}'::text[],
    trace_code_prefix text,
    origin_place text DEFAULT '源头工坊原产'::text,
    qc_certificate_url text,
    measure_unit text DEFAULT '箱'::text,
    carrier_type text DEFAULT 'none'::text,
    channel_brick_and_mortar boolean DEFAULT true,
    channel_ecommerce boolean DEFAULT true,
    custom_specs jsonb DEFAULT '{}'::jsonb,
    sales_channel_type text DEFAULT '实体与电商双轨'::text,
    category_tertiary text,
    tier_3_price numeric(10,2),
    is_archived boolean DEFAULT false
);


--
-- Name: product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.product_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: public_platform_tenant_directory; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_platform_tenant_directory AS
 SELECT id,
    tenant_id,
    company_name,
    business_type,
    contact_person,
    membership_status,
    created_at
   FROM public.platform_tenant
  WHERE (COALESCE(membership_status, 'active'::text) <> ALL (ARRAY['paused'::text, 'banned'::text]));


--
-- Name: public_suppliers_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_suppliers_view WITH (security_invoker='true') AS
 SELECT (((to_jsonb(t.*) - 'access_key'::text) - 'totp_secret'::text) - 'reset_claim_token'::text) AS safe_data,
    id,
    tenant_id,
    company_name,
    business_type,
    is_active
   FROM public.platform_tenant t
  WHERE (is_active = true);


--
-- Name: store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store (
    id bigint NOT NULL,
    tenant_id text DEFAULT 'BJ_HQ'::text NOT NULL,
    wechat_openid text,
    name text NOT NULL,
    contact_name text,
    phone text NOT NULL,
    address text DEFAULT '臨街門面'::text,
    route_name text DEFAULT '城东A线'::text,
    sort_order integer DEFAULT 1,
    price_tier text DEFAULT 'TIER_1'::text,
    credit_limit numeric(10,2) DEFAULT 2000.00,
    current_debt numeric(10,2) DEFAULT 0.00,
    created_at timestamp with time zone DEFAULT now(),
    driver_name character varying(50) DEFAULT '老張師傅'::character varying,
    driver_phone character varying(20) DEFAULT '13800138001'::character varying,
    visible_product_ids integer[],
    allow_credit boolean DEFAULT true,
    contact character varying(50) DEFAULT '掌櫃'::character varying,
    crates integer DEFAULT 0,
    tags text[] DEFAULT '{}'::text[],
    allowed_settlements text[] DEFAULT ARRAY['cash'::text, 'credit'::text],
    default_settlement text DEFAULT 'credit'::text,
    custom_settlement_terms text,
    monthly_return_quota numeric(10,2) DEFAULT 500.00,
    used_return_quota numeric(10,2) DEFAULT 0.00,
    shop_category text DEFAULT '社区便民超市'::text,
    settle_workflow text DEFAULT 'cash_on_delivery'::text,
    carrier_hold_count integer DEFAULT 0,
    custom_pricing jsonb DEFAULT '{}'::jsonb,
    basket_count integer DEFAULT 0,
    is_archived boolean DEFAULT false
);


--
-- Name: store_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.store ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.store_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: store_lead; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_lead (
    id integer NOT NULL,
    tenant_id character varying(50) NOT NULL,
    shop_name character varying(100) NOT NULL,
    boss_name character varying(50),
    phone character varying(20) NOT NULL,
    address character varying(200),
    intent_level character varying(20) DEFAULT '意向較強'::character varying,
    salesman character varying(50) DEFAULT '小李業務員'::character varying,
    last_visited_at timestamp with time zone DEFAULT now(),
    note text
);


--
-- Name: store_lead_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_lead_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_lead_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_lead_id_seq OWNED BY public.store_lead.id;


--
-- Name: store_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_order (
    id integer NOT NULL,
    tenant_id character varying(50) NOT NULL,
    store_id integer NOT NULL,
    store_name character varying(100) NOT NULL,
    driver_name character varying(50) DEFAULT '配送师傅'::character varying,
    total_amount numeric(10,2) NOT NULL,
    pay_type character varying(20) DEFAULT 'cod'::character varying,
    pay_status character varying(20) DEFAULT 'pending'::character varying,
    delivery_status character varying(20) DEFAULT 'ordered'::character varying,
    note text DEFAULT ''::text,
    sign_image_url text,
    created_at timestamp with time zone DEFAULT now(),
    items jsonb DEFAULT '[]'::jsonb,
    order_no text,
    order_source text DEFAULT 'store_order'::text,
    settlement_type text DEFAULT 'credit'::text,
    settlement_note text,
    driver_action_instruction text,
    return_amount numeric(10,2) DEFAULT 0.00,
    net_settle_amount numeric(10,2) DEFAULT 0.00,
    items_return jsonb DEFAULT '[]'::jsonb,
    items_exchange jsonb DEFAULT '[]'::jsonb,
    proof_images text[] DEFAULT ARRAY[]::text[],
    order_status text DEFAULT 'pending_confirm'::text,
    vendor_feedback text,
    over_credit_amount numeric(10,2) DEFAULT 0.00,
    hq_approval_note text,
    is_archived boolean DEFAULT false,
    last_delivery_tx_uuid text
);


--
-- Name: store_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_order_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_order_id_seq OWNED BY public.store_order.id;


--
-- Name: sys_qr_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_qr_session (
    id bigint NOT NULL,
    ticket text NOT NULL,
    tenant_id text,
    role text DEFAULT 'tenant'::text,
    is_verified boolean DEFAULT false,
    expired_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sys_qr_session_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_qr_session_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_qr_session_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_qr_session_id_seq OWNED BY public.sys_qr_session.id;


--
-- Name: tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant (
    id text NOT NULL,
    name text NOT NULL,
    contact_phone text,
    status text DEFAULT 'ACTIVE'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenant_application; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_application (
    id bigint NOT NULL,
    company_name text NOT NULL,
    tenant_id text NOT NULL,
    business_type text NOT NULL,
    service_mode text DEFAULT 'offline'::text,
    contact_person text NOT NULL,
    contact_phone text NOT NULL,
    license_image_url text,
    application_status text DEFAULT 'pending_review'::text,
    payment_status text DEFAULT 'unpaid'::text,
    membership_fee numeric(10,2) DEFAULT 0.00,
    invite_code text,
    review_note text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    credit_code text,
    ai_audit_score numeric DEFAULT 0,
    backup_phone text,
    sponsor_org text,
    brand_origin_desc text,
    access_key text
);


--
-- Name: tenant_application_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_application_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_application_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_application_id_seq OWNED BY public.tenant_application.id;


--
-- Name: tenant_security_vault; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_security_vault (
    tenant_id text NOT NULL,
    access_key_hash text NOT NULL,
    backup_phone text,
    totp_secret text,
    totp_enabled boolean DEFAULT false,
    recovery_code_hashes jsonb DEFAULT '[]'::jsonb,
    reset_claim_token text,
    session_epoch integer DEFAULT 1,
    timelock_status text DEFAULT 'none'::text,
    timelock_started_at timestamp with time zone,
    timelock_expires_at timestamp with time zone,
    timelock_cooldown_until timestamp with time zone,
    timelock_requester_info text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenant_sub_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_sub_user (
    id bigint NOT NULL,
    tenant_id text NOT NULL,
    account_name text NOT NULL,
    real_name text NOT NULL,
    password_hash text NOT NULL,
    role_code text NOT NULL,
    phone text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenant_sub_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_sub_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_sub_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_sub_user_id_seq OWNED BY public.tenant_sub_user.id;


--
-- Name: audit_immutable_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_immutable_log ALTER COLUMN id SET DEFAULT nextval('public.audit_immutable_log_id_seq'::regclass);


--
-- Name: demand_forecast_plan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demand_forecast_plan ALTER COLUMN id SET DEFAULT nextval('public.demand_forecast_plan_id_seq'::regclass);


--
-- Name: driver id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver ALTER COLUMN id SET DEFAULT nextval('public.driver_id_seq'::regclass);


--
-- Name: driver_collection_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_collection_log ALTER COLUMN id SET DEFAULT nextval('public.driver_collection_log_id_seq'::regclass);


--
-- Name: inventory_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_log ALTER COLUMN id SET DEFAULT nextval('public.inventory_log_id_seq'::regclass);


--
-- Name: local_inventory_pool id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_inventory_pool ALTER COLUMN id SET DEFAULT nextval('public.local_inventory_pool_id_seq'::regclass);


--
-- Name: platform_admin_credential id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_credential ALTER COLUMN id SET DEFAULT nextval('public.platform_admin_credential_id_seq'::regclass);


--
-- Name: platform_compliance_case id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_compliance_case ALTER COLUMN id SET DEFAULT nextval('public.platform_compliance_case_id_seq'::regclass);


--
-- Name: platform_membership_plan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_membership_plan ALTER COLUMN id SET DEFAULT nextval('public.platform_membership_plan_id_seq'::regclass);


--
-- Name: platform_standard_category id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_standard_category ALTER COLUMN id SET DEFAULT nextval('public.platform_standard_category_id_seq'::regclass);


--
-- Name: platform_suggestion_board id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_suggestion_board ALTER COLUMN id SET DEFAULT nextval('public.platform_suggestion_board_id_seq'::regclass);


--
-- Name: platform_tenant id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_tenant ALTER COLUMN id SET DEFAULT nextval('public.platform_tenant_id_seq'::regclass);


--
-- Name: store_lead id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_lead ALTER COLUMN id SET DEFAULT nextval('public.store_lead_id_seq'::regclass);


--
-- Name: store_order id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_order ALTER COLUMN id SET DEFAULT nextval('public.store_order_id_seq'::regclass);


--
-- Name: sys_qr_session id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_qr_session ALTER COLUMN id SET DEFAULT nextval('public.sys_qr_session_id_seq'::regclass);


--
-- Name: tenant_application id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_application ALTER COLUMN id SET DEFAULT nextval('public.tenant_application_id_seq'::regclass);


--
-- Name: tenant_sub_user id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sub_user ALTER COLUMN id SET DEFAULT nextval('public.tenant_sub_user_id_seq'::regclass);


--
-- Data for Name: audit_immutable_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_immutable_log (id, tenant_id, operator_account, operator_name, action_level, action_title, action_details, client_ip, tamper_seal, created_at) FROM stdin;
1	PLATFORM	admin	測試員	INFO	系統初始化日誌	{}	127.0.0.1	\N	2026-11-10 11:27:44.105981+00
2	PLATFORM	admin	平台总控运营主管	WARN	商契氣象調控	{"note": "", "tenant_key": "BJ_SHUNDA", "target_status": "active"}	127.0.0.1	SEAL-SXWK96G	2026-11-10 12:43:11.156356+00
3	PLATFORM	admin	平台总控运营主管	WARN	商契氣象調控	{"note": "", "tenant_key": "SH_LEGOU", "target_status": "grace"}	127.0.0.1	SEAL-SHQ6CFK	2026-11-10 12:43:23.446306+00
4	PLATFORM	admin	平台总控运营主管	WARN	商契氣象調控	{"note": "", "tenant_key": "SH_LEGOU", "target_status": "active"}	127.0.0.1	SEAL-T3YF1FN	2026-11-11 00:05:18.272545+00
\.


--
-- Data for Name: auth_rate_limit; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_rate_limit (rate_key, fail_count, locked_until, updated_at) FROM stdin;
\.


--
-- Data for Name: demand_forecast_plan; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.demand_forecast_plan (id, tenant_id, store_id, store_name, plan_cycle, expected_date, items, note, status, created_at) FROM stdin;
\.


--
-- Data for Name: driver; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.driver (id, tenant_id, name, phone, route_name, status) FROM stdin;
1	BJ_SHUNDA	老張師傅	13800138001	城東A線	在崗
2	BJ_SHUNDA	李師傅	13800138002	城西B線	在崗
3	SH_LEGOU	陳師傅	13900139001	浦東線	在崗
\.


--
-- Data for Name: driver_collection_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.driver_collection_log (id, tenant_id, store_id, store_name, driver_name, collect_type, amount, discount_amount, pay_method, sign_image_url, settled_to_hq, created_at, basket_return, basket_deduct_amount, client_tx_uuid) FROM stdin;
4	SH_LEGOU	6	新合作便利店	配送师傅	order_delivery	0.00	0.00	现金	data:image/png;base64,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	t	2026-11-08 14:24:59.680626+00	0	0.00	\N
\.


--
-- Data for Name: inventory_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_log (id, tenant_id, product_id, product_name, action_type, delta_qty, before_stock, after_stock, operator_name, remark, created_at) FROM stdin;
\.


--
-- Data for Name: local_inventory_pool; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.local_inventory_pool (id, tenant_id, from_store_id, from_store_name, to_store_id, to_store_name, product_id, product_name, spec, measure_unit, qty, transfer_price, reason, driver_name, status, created_at, claimed_at, completed_at) FROM stdin;
\.


--
-- Data for Name: login_qr_session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.login_qr_session (session_token, tenant_id, role_code, operator_name, status, created_at, expires_at) FROM stdin;
SCAN-LX91G8T2	\N	owner	\N	waiting	2026-11-21 02:32:03.307965+00	2026-11-21 02:33:33.307965+00
SCAN-SJYM20BI	\N	owner	\N	waiting	2026-11-21 09:47:59.137613+00	2026-11-21 09:49:29.137613+00
SCAN-Y6PI4OXY	\N	owner	\N	waiting	2026-11-21 09:48:11.292713+00	2026-11-21 09:49:41.292713+00
SCAN-A3LMVFDK	\N	owner	\N	waiting	2026-11-23 00:12:14.282705+00	2026-11-23 00:13:44.282705+00
SCAN-6G44R39I	\N	owner	\N	waiting	2026-11-23 00:13:00.576885+00	2026-11-23 00:14:30.576885+00
\.


--
-- Data for Name: onboarding_query_guard; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.onboarding_query_guard (phone, fail_count, locked_until) FROM stdin;
\.


--
-- Data for Name: order_item; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_item (id, order_id, product_id, product_name, barcode, unit, price, quantity, amount) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, tenant_id, order_no, store_id, store_name, route_name, total_amount, status, pay_status, delivery_date, created_at, actual_amount, reject_reason) FROM stdin;
\.


--
-- Data for Name: payment_record; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payment_record (id, tenant_id, store_id, order_id, amount, pay_method, operator, remark, created_at) FROM stdin;
\.


--
-- Data for Name: platform_admin_credential; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_admin_credential (id, admin_account, secret_token, admin_name, wx_openid, is_active, created_at, totp_secret, totp_enabled, admin_role) FROM stdin;
1	jimking-root01	root@platform999	平台总控运营主管	\N	t	2026-11-09 14:06:55.04044+00	BL53EMUHMF6YSKXRIFT2IFZHCQ	t	admin_chief
\.


--
-- Data for Name: platform_category; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_category (id, name, level, parent_id, applicable_mode, sort_order, created_at, is_active) FROM stdin;
\.


--
-- Data for Name: platform_category_dict; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_category_dict (id, category_name, sort_order, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: platform_compliance_case; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_compliance_case (id, case_type, tenant_id, company_name, target_ref_id, target_title, ai_findings, status, merchant_appeal_note, merchant_evidence_url, arbiter_notes, created_at, resolved_at) FROM stdin;
\.


--
-- Data for Name: platform_gov_configs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_gov_configs (config_key, config_value, description, updated_at) FROM stdin;
order_revoke_window_minutes	5	门店报用度/签收后的自助误操作撤回保护窗口（单位：分钟，后台可随时调整，设为0则关闭）	2026-11-23 03:22:32.846285+00
join_audit_strict_mode	normal	全网入驻审核模式：normal=常规核验放行，strict=防抢注从严逐笔终审	2026-11-23 03:35:34.733244+00
global_platform_notice		全网商道公告横幅内容（空则不显示，非空则同步推送到合作社与门店）	2026-11-23 03:35:34.733244+00
covenant_platform_text		《百工百业数字公器 · 平台入驻与商道公约》在线修订版正文	2026-11-23 03:35:34.733244+00
covenant_store_text		《合作门店与社区邻里驿站公约》在线修订版正文	2026-11-23 03:35:34.733244+00
global_emergency_freeze	off	全网紧急熔断开关：off=正常协作，freeze=全网只读保供模式（暂停新上架与新注册，保留既有订单履约与对账）	2026-11-23 03:51:15.463748+00
platform_totp_recovery_hashes	[]	总控 TOTP 验证器一次性应急恢复码 SHA-256 哈希集合（零明文存储，用过即作废）	2026-11-23 05:29:08.827075+00
platform_co_steward_profile	{"enabled":false,"account":"","name":"","tokenHash":""}	第二位联席执事人（双人互备）配置（口令仅存SHA-256单向哈希，零明文）	2026-11-23 05:35:06.738685+00
\.


--
-- Data for Name: platform_governance_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_governance_config (config_key, config_label, config_value, value_type, category, description, updated_at) FROM stdin;
trial_days_default	新入驻免费体验天数	7	number	membership	新主体审核通过后的默认体验天数，可设为任意天数	2026-11-22 11:27:05.106177+00
grace_extension_days	体验期满单次宽待延期天数	7	number	membership	商家申请宽待延期时每次增加的天数	2026-11-22 11:27:05.106177+00
max_grace_extensions	允许申请宽待延期最多次数	2	number	membership	单个商号最多可申请宽待延期的次数	2026-11-22 11:27:05.106177+00
query_fail_lock_hours	核身查询输错熔断小时数	24	number	security	连续输错查询信息达到阈值后的锁定时长	2026-11-22 11:27:05.106177+00
timelock_observe_hours	紧急找回安全观察小时数	72	number	security	无验证器紧急重置密码时的安全观察期时长	2026-11-22 11:27:05.106177+00
public_report_freeze_threshold	街坊监督触发复核票数	2	number	ai_audit	同一商品收到多少条有效监督建议后自动进入复核	2026-11-22 11:27:05.106177+00
external_payment_gateway_url	国内独立备案收银台网关地址		text	settlement	留空则仅启用线下交割/对账/物物置换；未来国内备案收银台上线后填入地址即可平滑激活	2026-11-22 11:27:05.106177+00
blocked_promo_keywords	宣传夸大与违禁拦截词库	国家级,根治,包治百病,特效药,第一品牌,稳赚不赔,刷单,兼职返现	text	ai_audit	英文逗号分隔，AI巡检自动拦截包含此类词汇的商品描述	2026-11-22 11:27:05.106177+00
allowed_video_domains	外链音视频安全域名白名单	douyin.com,kuaishou.com,bilibili.com,weixin.qq.com,v.qq.com,aliyuncs.com,myqcloud.com	text	ai_audit	英文逗号分隔，防止外部恶意短链与私域导流二维码	2026-11-22 11:27:05.106177+00
\.


--
-- Data for Name: platform_membership_plan; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_membership_plan (id, plan_code, plan_name, tagline, fee_amount, billing_cycle, max_staff_accounts, max_partner_stations, enabled_modules, is_active, sort_order, created_at) FROM stdin;
1	PLAN_EXPERIENCE	新入驻体验席	全功能体验，自由上手，到期自主选档或申请宽待	0.00	trial	3	10	["goods_basic", "order_ledger", "plan_schedule", "idle_share", "barter_exchange", "data_export"]	t	1	2026-11-22 11:27:05.106177+00
2	PLAN_CRAFTSMAN	乡土匠人 / 个人实名席	适合实名农户、手艺人及小型家庭作坊日常接单记账	99.00	yearly	2	15	["goods_basic", "order_ledger", "plan_schedule", "idle_share", "barter_exchange", "data_export"]	t	2	2026-11-22 11:27:05.106177+00
3	PLAN_COOP_STD	合作社 / 源头工坊标准席	适合村社合作社与生产工坊统筹排产、余缺互调与多店协作	199.00	yearly	10	50	["goods_basic", "order_ledger", "plan_schedule", "idle_share", "barter_exchange", "data_export"]	t	3	2026-11-22 11:27:05.106177+00
4	PLAN_PUBLIC_CARE	公益帮扶 / 基础展销席	老订单照常履约平账，零强制、保数据主权	0.00	yearly	1	5	["goods_basic", "order_ledger", "plan_schedule", "idle_share", "barter_exchange", "data_export"]	t	4	2026-11-22 11:27:05.106177+00
\.


--
-- Data for Name: platform_standard_category; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_standard_category (id, level, parent_id, category_name, suggested_tags, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: platform_suggestion_board; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_suggestion_board (id, proposer_type, proposer_name, proposer_phone, category, content, reply_status, official_reply, replied_at, created_at) FROM stdin;
\.


--
-- Data for Name: platform_tenant; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_tenant (id, tenant_id, company_name, contact_name, phone, invite_code, tier, status, expire_date, max_stores, created_at, entity_type, contact_phone, contact_mobile, contact_person, business_type, service_mode, membership_tier, membership_fee, is_active, access_key, wx_openid, wx_nickname, totp_secret, totp_enabled, membership_status, reset_claim_token, brand_origin_desc, permit_brick_and_mortar, permit_ecommerce, credit_code, valid_until, ai_audit_score, ai_audit_log, webhook_url, media_url, region, address, intro, custom_settings, backup_phone, sponsor_org, license_url, id_card_url, admin_remark, session_epoch, timelock_status, timelock_expires_at) FROM stdin;
1	BJ_SHUNDA	北京顺达商贸有限责任公司	张总监	13800000001	BJ_SHUNDA	pro	active	2027-11-08	200	2026-11-08 01:42:28.985532+00	dealer	13800000001	13800000001	张总监	dealer	offline	standard	0.00	t	shunda@2026	\N	\N	JBSWY3DPEHPK3PXP	t	active	\N	匠心传承 · 正品可溯	t	t	\N	\N	0	\N		\N	\N	\N	\N	{}	\N	\N	\N	\N	\N	1	none	\N
2	SH_LEGOU	上海乐购供应链管理有限公司	李总	13800000002	SH_LEGOU	pro	active	2027-05-08	200	2026-11-08 01:42:28.985532+00	factory	13800000002	13800000002	李总	dealer	both	standard	0.00	t	legou@2026	\N	\N	KRSXG5CTMVRXEZLU	t	active	\N	匠心传承 · 正品可溯	t	t	\N	\N	0	\N		\N	\N	\N	\N	{"promos": [], "carriers": [{"name": "周转铁料箱", "deposit": 50}], "tier1Name": "批发平准基准价", "tier2Name": "网上平准零售基准价", "storeTiers": [{"name": "工程项目战略户", "creditLimit": 30000, "returnQuota": 3000, "discountRate": 0.92}, {"name": "五金机电合作店", "creditLimit": 5000, "returnQuota": 500, "discountRate": 0.96}, {"name": "零星维修工坊", "creditLimit": 1000, "returnQuota": 200, "discountRate": 1}], "onlineTiers": [{"rate": 1, "label": "网购散装价", "minQty": 1}], "rebateTiers": [{"rate": 2.5, "threshold": 30000}], "twoFaCashOn": true, "harvestAidOn": false, "promoterRate": 5, "twoFaLimitOn": true, "twoFaPriceOn": true, "rebateEnabled": true, "referralBonus": 150, "seasonalPause": {"reason": "", "isPaused": false, "resumeDate": ""}, "slipHeaderSub": "工料配件直供中心 · 规格齐全 · 按需配送", "slipStampText": "仓储配发专用章", "twoFaCreditOn": true, "twoFaDeleteOn": true, "twoFaExportOn": true, "twoFaPolicyOn": true, "twoFaPricePct": 15, "campaignActive": false, "expiryWarnDays": 0, "rationLimitQty": 0, "slipFooterNote": "非质量问题定制件不退不换，标准件完整包装支持调换。", "twoFaThreshold": 5000, "defaultMinStock": 20, "promoterEnabled": true, "allowStoreReturn": true, "storeTierEnabled": true, "storeCustomFields": ["施工工地名称", "开票税号与收货负责人"], "twoFaStockAuditOn": true, "onlinePriceEnabled": false}	\N	\N	\N	\N	\N	1	none	\N
17	HZ-91411300A	伏牛山生态粮油合作社	\N	13800138001	\N	pro	active	2027-11-21	200	2026-11-21 04:52:37.065705+00	dealer	\N	\N	赵建国	coop	实体与电商双轨	standard	0.00	t	40010A	\N	\N	\N	f	active	\N	伏牛山南麓生态种植基地，直供五常大米、古法菜籽油与杂粮。	t	t	91411300MA4000010A	\N	0	\N		\N	\N	\N	\N	{}	\N	\N	\N	\N	\N	1	none	\N
18	GC-91310115B	申城匠心饮品酿造工坊	\N	13900139002	\N	pro	active	2027-11-21	200	2026-11-21 04:52:37.065705+00	dealer	\N	\N	陈明远	factory	实体与电商双轨	standard	0.00	t	00020B	\N	\N	\N	f	active	\N	源头工坊直发，纯粮酿造与天然果饮，支持门店整箱配发与邻里自提。	t	t	91310115MA1K00020B	\N	0	\N		\N	\N	\N	\N	{}	\N	\N	\N	\N	\N	1	none	\N
\.


--
-- Data for Name: product; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product (id, tenant_id, barcode, name, spec, pack_unit, tier_1_price, tier_2_price, stock_qty, created_at, stock, category, category_main, category_sub, image_url, status, remark, custom_fields, tags, trace_code_prefix, origin_place, qc_certificate_url, measure_unit, carrier_type, channel_brick_and_mortar, channel_ecommerce, custom_specs, sales_channel_type, category_tertiary, tier_3_price, is_archived) FROM stdin;
10	SH_LEGOU	231211231313213131	衡水老白干	整箱裝	瓶	10.00	10.00	9999	2026-11-07 13:26:28.942661+00	993	休閒食品	酒水飲料	啤酒/白酒		active	zhuyao	{}	{}	\N	源头工坊原产	\N	箱	none	t	t	{"rectify_note": "AI 参谋温馨提示：贵号【衡水老白干】建议补充一张清晰实拍照，有助于邻里与合作门店更直观了解实物品质！", "ai_minor_notified": true}	实体与电商双轨	\N	\N	f
5	SH_HQ	6900000000001	上海光明纯牛奶 250ml	24盒/箱	箱	68.00	65.00	400	2026-11-06 11:30:40.94789+00	999	休閒食品	休閒食品	膨化/餅乾		active		{}	{}	\N	源头工坊原产	\N	箱	none	t	t	{"rectify_note": "AI 参谋温馨提示：贵号【上海光明纯牛奶 250ml】建议补充一张清晰实拍照，有助于邻里与合作门店更直观了解实物品质！", "ai_minor_notified": true}	实体与电商双轨	\N	\N	f
4	BJ_HQ	6903148110022	金龙鱼食用调和油 5L	4桶/箱	箱	198.00	190.00	80	2026-11-06 11:30:40.94789+00	999	休閒食品	休閒食品	膨化/餅乾		active		{}	{}	\N	源头工坊原产	\N	箱	none	t	t	{"rectify_note": "AI 参谋温馨提示：贵号【金龙鱼食用调和油 5L】建议补充一张清晰实拍照，有助于邻里与合作门店更直观了解实物品质！", "ai_minor_notified": true}	实体与电商双轨	\N	\N	f
3	BJ_HQ	6902083881203	康师傅红烧牛肉面 经典五连包	6包/箱	箱	55.00	53.00	200	2026-11-06 11:30:40.94789+00	999	休閒食品	休閒食品	膨化/餅乾		active		{}	{}	\N	源头工坊原产	\N	箱	none	t	t	{"rectify_note": "AI 参谋温馨提示：贵号【康师傅红烧牛肉面 经典五连包】建议补充一张清晰实拍照，有助于邻里与合作门店更直观了解实物品质！", "ai_minor_notified": true}	实体与电商双轨	\N	\N	f
2	BJ_HQ	6901668053123	可口可乐 330ml 摩登罐	24罐/箱	箱	42.00	40.50	300	2026-11-06 11:30:40.94789+00	999	休閒食品	休閒食品	膨化/餅乾		active		{}	{}	\N	源头工坊原产	\N	箱	none	t	t	{"rectify_note": "AI 参谋温馨提示：贵号【可口可乐 330ml 摩登罐】建议补充一张清晰实拍照，有助于邻里与合作门店更直观了解实物品质！", "ai_minor_notified": true}	实体与电商双轨	\N	\N	f
1	BJ_HQ	6921168593818	农夫山泉饮用水 550ml	24瓶/箱	箱	28.50	27.00	500	2026-11-06 11:30:40.94789+00	999	休閒食品	休閒食品	膨化/餅乾		active		{}	{}	\N	源头工坊原产	\N	箱	none	t	t	{"rectify_note": "AI 参谋温馨提示：贵号【农夫山泉饮用水 550ml】建议补充一张清晰实拍照，有助于邻里与合作门店更直观了解实物品质！", "ai_minor_notified": true}	实体与电商双轨	\N	\N	f
\.


--
-- Data for Name: store; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.store (id, tenant_id, wechat_openid, name, contact_name, phone, address, route_name, sort_order, price_tier, credit_limit, current_debt, created_at, driver_name, driver_phone, visible_product_ids, allow_credit, contact, crates, tags, allowed_settlements, default_settlement, custom_settlement_terms, monthly_return_quota, used_return_quota, shop_category, settle_workflow, carrier_hold_count, custom_pricing, basket_count, is_archived) FROM stdin;
1	BJ_HQ	wx_test_mock_openid_123	利民便利店	张老板	13800000001	建设路12号	城东A线	1	TIER_1	3000.00	450.00	2026-11-06 11:30:40.94789+00	老張師傅	13800138001	\N	t	掌櫃	0	{}	{cash,credit}	credit	\N	500.00	0.00	社区便民超市	cash_on_delivery	0	{}	0	f
2	BJ_HQ	wx_test_mock_openid_456	红太阳超市	李大姐	13800000002	建设路58号	城东A线	2	TIER_2	5000.00	0.00	2026-11-06 11:30:40.94789+00	老張師傅	13800138001	\N	t	掌櫃	0	{}	{cash,credit}	credit	\N	500.00	0.00	社区便民超市	cash_on_delivery	0	{}	0	f
3	SH_HQ	wx_shanghai_store_001	沪上乐购小店	陈老板	13900000003	南京西路88号	浦东特快线	1	TIER_1	4000.00	200.00	2026-11-06 11:30:40.94789+00	老張師傅	13800138001	\N	t	掌櫃	0	{}	{cash,credit}	credit	\N	500.00	0.00	社区便民超市	cash_on_delivery	0	{}	0	f
6	SH_LEGOU	\N	新合作便利店	\N	18737702186	臨街門面	城东A线	1	TIER_1	5000.00	50.00	2026-11-07 12:19:33.752708+00	张师傅	13800138001	\N	t	掌櫃	0	{#商誉好,"#LV1 核心战略店"}	{cash,credit}	cash		1000.00	0.00	社区便民超市	cash_on_delivery	0	{"price_tier": "tier_1", "ext_profile": {}, "item_prices": {}, "discount_rate": 0.95}	0	f
\.


--
-- Data for Name: store_lead; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.store_lead (id, tenant_id, shop_name, boss_name, phone, address, intent_level, salesman, last_visited_at, note) FROM stdin;
1	BJ_SHUNDA	街坊聚惠煙酒便利	趙老板	13911118888	朝陽區建國路88號臨街	意向較強	小李業務員	2026-11-07 11:53:46.598375+00	嫌目前供貨商送貨慢，願嘗試金龍魚及水飲，約好週五複訪
2	BJ_SHUNDA	紅星社群平價超市	周大姐	13822229999	朝陽區甘露園南里二期門面	猶豫觀望	小李業務員	2026-11-07 11:53:46.598375+00	想要3000元周轉賬期，待經理特批後簽約
\.


--
-- Data for Name: store_order; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.store_order (id, tenant_id, store_id, store_name, driver_name, total_amount, pay_type, pay_status, delivery_status, note, sign_image_url, created_at, items, order_no, order_source, settlement_type, settlement_note, driver_action_instruction, return_amount, net_settle_amount, items_return, items_exchange, proof_images, order_status, vendor_feedback, over_credit_amount, hq_approval_note, is_archived, last_delivery_tx_uuid) FROM stdin;
5	SH_LEGOU	6	新合作便利店	送貨師傅	10.00	credit	pending	ordered		\N	2026-11-08 06:51:59.6103+00	[{"id": 10, "qty": 1, "name": "衡水老白干", "spec": "整箱裝", "price": 10}]	\N	store_order	credit	\N	【随车指令】配发新货 1项；按credit挂账签字，严禁私收现金！	0.00	0.00	[]	[]	{}	confirmed	\N	0.00	\N	f	\N
4	SH_LEGOU	6	新合作便利店	送貨師傅	10.00	credit	pending	ordered		\N	2026-11-08 06:44:04.472471+00	[{"id": 10, "qty": 1, "name": "衡水老白干", "spec": "整箱裝", "price": 10}]	\N	store_order	credit	\N	【随车指令】配发新货 1项；按credit挂账签字，严禁私收现金！	0.00	0.00	[]	[]	{}	confirmed	\N	0.00	\N	f	\N
2	SH_LEGOU	6	新合作便利店	送貨師傅	10.00	credit	pending	ordered		\N	2026-11-08 06:43:34.95067+00	[{"id": 10, "qty": 1, "name": "衡水老白干", "spec": "整箱裝", "price": 10}]	\N	store_order	credit	\N	【随车指令】配发新货 1项；按credit挂账签字，严禁私收现金！	0.00	0.00	[]	[]	{}	confirmed	\N	0.00	\N	f	\N
3	SH_LEGOU	6	新合作便利店	送貨師傅	10.00	credit	pending	ordered		\N	2026-11-08 06:43:46.139361+00	[{"id": 10, "qty": 1, "name": "衡水老白干", "spec": "整箱裝", "price": 10}]	\N	store_order	credit	\N	【随车指令】配发新货 1项；按credit挂账签字，严禁私收现金！	0.00	0.00	[]	[]	{}	confirmed	\N	0.00	\N	f	\N
6	SH_LEGOU	6	新合作便利店	送貨師傅	10.00	credit	pending	ordered		\N	2026-11-08 07:04:44.796003+00	[{"id": 10, "qty": 1, "name": "衡水老白干", "spec": "整箱裝", "price": 10}]	\N	store_order	credit	\N	\N	0.00	0.00	[]	[]	{}	cancelled	先送一半	0.00	\N	f	\N
7	SH_LEGOU	6	新合作便利店	张师傅	10.00	credit	cash_zero_cleared	delivered		data:image/png;base64,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	2026-11-08 12:18:41.2003+00	[{"id": 10, "qty": 1, "name": "衡水老白干", "spec": "整箱裝", "price": 10}]	DH-20261108-8873	store_order	credit		【随车指令】配发新货 1项；验退带回 1箱旧品；按credit挂账签字，严禁私收现金！	10.00	0.00	[{"id": 10, "qty": 1, "name": "衡水老白干", "spec": "整箱裝", "price": 10, "reason": "外箱受损/变形破裂"}]	[]	{}	delivered	\N	0.00	\N	f	\N
10	SH_LEGOU	6	百福超市	待指派业务员	0.00	cod	pending	lead_pending	[新店招商线索] 联系人:李老板 | 电话:18737702186 | 地址:郑州航空港豫发门店 | 意向:酒	\N	2026-11-13 02:07:15.104653+00	[]	LEAD-20261113-7909	b2b_directory_lead	credit	李老板|18737702186|郑州航空港豫发门店	【新店送样线索】联系 李老板(18737702186) 上门洽谈	0.00	0.00	[]	[]	{}	pending_confirm	\N	0.00	\N	f	\N
11	SH_LEGOU	6	百福超市	待指派业务员	0.00	cod	pending	lead_pending	[新店招商线索] 联系人:李老板 | 电话:18737702186 | 地址:郑州航空港豫发门店 | 意向:酒	\N	2026-11-13 02:24:47.996593+00	[]	LEAD-20261113-2331	b2b_directory_lead	credit	李老板|18737702186|郑州航空港豫发门店	【新店送样线索】联系 李老板(18737702186) 上门洽谈	0.00	0.00	[]	[]	{}	pending_confirm	\N	0.00	\N	f	\N
\.


--
-- Data for Name: sys_qr_session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sys_qr_session (id, ticket, tenant_id, role, is_verified, expired_at, created_at) FROM stdin;
\.


--
-- Data for Name: tenant; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant (id, name, contact_phone, status, created_at) FROM stdin;
BJ_HQ	北京顺达商贸有限公司	13811112222	ACTIVE	2026-11-06 11:39:04.986615+00
SH_HQ	上海乐购供应链管理中心	13933334444	ACTIVE	2026-11-06 11:39:04.986615+00
\.


--
-- Data for Name: tenant_application; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_application (id, company_name, tenant_id, business_type, service_mode, contact_person, contact_phone, license_image_url, application_status, payment_status, membership_fee, invite_code, review_note, reviewed_at, created_at, credit_code, ai_audit_score, backup_phone, sponsor_org, brand_origin_desc, access_key) FROM stdin;
\.


--
-- Data for Name: tenant_security_vault; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_security_vault (tenant_id, access_key_hash, backup_phone, totp_secret, totp_enabled, recovery_code_hashes, reset_claim_token, session_epoch, timelock_status, timelock_started_at, timelock_expires_at, timelock_cooldown_until, timelock_requester_info, updated_at) FROM stdin;
BJ_SHUNDA	shunda@2026	\N	JBSWY3DPEHPK3PXP	t	[]	\N	1	none	\N	\N	\N	\N	2026-11-21 08:09:37.942979+00
SH_LEGOU	legou@2026	\N	KRSXG5CTMVRXEZLU	t	[]	\N	1	none	\N	\N	\N	\N	2026-11-21 08:09:37.942979+00
HZ-91411300A	40010A	\N	\N	f	[]	\N	1	none	\N	\N	\N	\N	2026-11-21 08:09:37.942979+00
GC-91310115B	00020B	\N	\N	f	[]	\N	1	none	\N	\N	\N	\N	2026-11-21 08:09:37.942979+00
\.


--
-- Data for Name: tenant_sub_user; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_sub_user (id, tenant_id, account_name, real_name, password_hash, role_code, phone, is_active, created_at) FROM stdin;
1	BJ_SHUNDA	finance01	账房李先生	fin@123	finance	13800000001	t	2026-11-10 06:58:43.883783+00
2	BJ_SHUNDA	driver_zhang	张师傅	drv@123	driver	13800000002	t	2026-11-10 06:58:43.883783+00
3	BJ_SHUNDA	wh_chen	陈库管	wh@123	warehouse	13800000003	t	2026-11-10 06:58:43.883783+00
7	SH_LEGOU	driver_wang	王师傅	drv@123	driver	13900000001	t	2026-11-10 10:26:30.893954+00
8	SH_LEGOU	finance_zhao	赵出纳	fin@123	finance	13900000002	t	2026-11-10 10:26:30.893954+00
\.


--
-- Name: audit_immutable_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_immutable_log_id_seq', 4, true);


--
-- Name: demand_forecast_plan_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.demand_forecast_plan_id_seq', 1, false);


--
-- Name: driver_collection_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.driver_collection_log_id_seq', 4, true);


--
-- Name: driver_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.driver_id_seq', 3, true);


--
-- Name: inventory_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_log_id_seq', 1, false);


--
-- Name: local_inventory_pool_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.local_inventory_pool_id_seq', 1, false);


--
-- Name: order_item_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_item_id_seq', 1, false);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.orders_id_seq', 1, false);


--
-- Name: payment_record_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payment_record_id_seq', 1, false);


--
-- Name: platform_admin_credential_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_admin_credential_id_seq', 8, true);


--
-- Name: platform_category_dict_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_category_dict_id_seq', 1, false);


--
-- Name: platform_category_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_category_id_seq', 1, false);


--
-- Name: platform_compliance_case_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_compliance_case_id_seq', 1, false);


--
-- Name: platform_membership_plan_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_membership_plan_id_seq', 4, true);


--
-- Name: platform_standard_category_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_standard_category_id_seq', 1, false);


--
-- Name: platform_suggestion_board_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_suggestion_board_id_seq', 1, false);


--
-- Name: platform_tenant_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_tenant_id_seq', 18, true);


--
-- Name: product_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_id_seq', 10, true);


--
-- Name: store_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store_id_seq', 7, true);


--
-- Name: store_lead_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store_lead_id_seq', 2, true);


--
-- Name: store_order_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store_order_id_seq', 11, true);


--
-- Name: sys_qr_session_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sys_qr_session_id_seq', 1, false);


--
-- Name: tenant_application_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tenant_application_id_seq', 1, true);


--
-- Name: tenant_sub_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tenant_sub_user_id_seq', 8, true);


--
-- Name: audit_immutable_log audit_immutable_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_immutable_log
    ADD CONSTRAINT audit_immutable_log_pkey PRIMARY KEY (id);


--
-- Name: auth_rate_limit auth_rate_limit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_rate_limit
    ADD CONSTRAINT auth_rate_limit_pkey PRIMARY KEY (rate_key);


--
-- Name: demand_forecast_plan demand_forecast_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demand_forecast_plan
    ADD CONSTRAINT demand_forecast_plan_pkey PRIMARY KEY (id);


--
-- Name: driver_collection_log driver_collection_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver_collection_log
    ADD CONSTRAINT driver_collection_log_pkey PRIMARY KEY (id);


--
-- Name: driver driver_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.driver
    ADD CONSTRAINT driver_pkey PRIMARY KEY (id);


--
-- Name: inventory_log inventory_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_log
    ADD CONSTRAINT inventory_log_pkey PRIMARY KEY (id);


--
-- Name: local_inventory_pool local_inventory_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_inventory_pool
    ADD CONSTRAINT local_inventory_pool_pkey PRIMARY KEY (id);


--
-- Name: login_qr_session login_qr_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_qr_session
    ADD CONSTRAINT login_qr_session_pkey PRIMARY KEY (session_token);


--
-- Name: onboarding_query_guard onboarding_query_guard_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_query_guard
    ADD CONSTRAINT onboarding_query_guard_pkey PRIMARY KEY (phone);


--
-- Name: order_item order_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_no_key UNIQUE (order_no);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payment_record payment_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_record
    ADD CONSTRAINT payment_record_pkey PRIMARY KEY (id);


--
-- Name: platform_admin_credential platform_admin_credential_admin_account_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_credential
    ADD CONSTRAINT platform_admin_credential_admin_account_key UNIQUE (admin_account);


--
-- Name: platform_admin_credential platform_admin_credential_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_credential
    ADD CONSTRAINT platform_admin_credential_pkey PRIMARY KEY (id);


--
-- Name: platform_category_dict platform_category_dict_category_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_category_dict
    ADD CONSTRAINT platform_category_dict_category_name_key UNIQUE (category_name);


--
-- Name: platform_category_dict platform_category_dict_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_category_dict
    ADD CONSTRAINT platform_category_dict_pkey PRIMARY KEY (id);


--
-- Name: platform_category platform_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_category
    ADD CONSTRAINT platform_category_pkey PRIMARY KEY (id);


--
-- Name: platform_compliance_case platform_compliance_case_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_compliance_case
    ADD CONSTRAINT platform_compliance_case_pkey PRIMARY KEY (id);


--
-- Name: platform_gov_configs platform_gov_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_gov_configs
    ADD CONSTRAINT platform_gov_configs_pkey PRIMARY KEY (config_key);


--
-- Name: platform_governance_config platform_governance_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_governance_config
    ADD CONSTRAINT platform_governance_config_pkey PRIMARY KEY (config_key);


--
-- Name: platform_membership_plan platform_membership_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_membership_plan
    ADD CONSTRAINT platform_membership_plan_pkey PRIMARY KEY (id);


--
-- Name: platform_membership_plan platform_membership_plan_plan_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_membership_plan
    ADD CONSTRAINT platform_membership_plan_plan_code_key UNIQUE (plan_code);


--
-- Name: platform_standard_category platform_standard_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_standard_category
    ADD CONSTRAINT platform_standard_category_pkey PRIMARY KEY (id);


--
-- Name: platform_suggestion_board platform_suggestion_board_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_suggestion_board
    ADD CONSTRAINT platform_suggestion_board_pkey PRIMARY KEY (id);


--
-- Name: platform_tenant platform_tenant_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_tenant
    ADD CONSTRAINT platform_tenant_invite_code_key UNIQUE (invite_code);


--
-- Name: platform_tenant platform_tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_tenant
    ADD CONSTRAINT platform_tenant_pkey PRIMARY KEY (id);


--
-- Name: platform_tenant platform_tenant_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_tenant
    ADD CONSTRAINT platform_tenant_tenant_id_key UNIQUE (tenant_id);


--
-- Name: product product_barcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_barcode_key UNIQUE (barcode);


--
-- Name: product product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);


--
-- Name: store_lead store_lead_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_lead
    ADD CONSTRAINT store_lead_pkey PRIMARY KEY (id);


--
-- Name: store_order store_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_order
    ADD CONSTRAINT store_order_pkey PRIMARY KEY (id);


--
-- Name: store store_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store
    ADD CONSTRAINT store_phone_key UNIQUE (phone);


--
-- Name: store store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store
    ADD CONSTRAINT store_pkey PRIMARY KEY (id);


--
-- Name: store store_wechat_openid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store
    ADD CONSTRAINT store_wechat_openid_key UNIQUE (wechat_openid);


--
-- Name: sys_qr_session sys_qr_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_qr_session
    ADD CONSTRAINT sys_qr_session_pkey PRIMARY KEY (id);


--
-- Name: sys_qr_session sys_qr_session_ticket_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_qr_session
    ADD CONSTRAINT sys_qr_session_ticket_key UNIQUE (ticket);


--
-- Name: tenant_application tenant_application_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_application
    ADD CONSTRAINT tenant_application_pkey PRIMARY KEY (id);


--
-- Name: tenant tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_pkey PRIMARY KEY (id);


--
-- Name: tenant_security_vault tenant_security_vault_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_security_vault
    ADD CONSTRAINT tenant_security_vault_pkey PRIMARY KEY (tenant_id);


--
-- Name: tenant_sub_user tenant_sub_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sub_user
    ADD CONSTRAINT tenant_sub_user_pkey PRIMARY KEY (id);


--
-- Name: tenant_sub_user tenant_sub_user_tenant_id_account_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sub_user
    ADD CONSTRAINT tenant_sub_user_tenant_id_account_name_key UNIQUE (tenant_id, account_name);


--
-- Name: idx_demand_plan_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_demand_plan_tenant_status ON public.demand_forecast_plan USING btree (tenant_id, status);


--
-- Name: idx_driver_collection_client_tx_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_driver_collection_client_tx_uuid ON public.driver_collection_log USING btree (client_tx_uuid) WHERE (client_tx_uuid IS NOT NULL);


--
-- Name: idx_driver_log_tenant_driver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_driver_log_tenant_driver ON public.driver_collection_log USING btree (tenant_id, driver_name, settled_to_hq);


--
-- Name: idx_inv_log_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_log_tenant_created ON public.inventory_log USING btree (tenant_id, created_at DESC);


--
-- Name: idx_local_pool_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_local_pool_tenant_status ON public.local_inventory_pool USING btree (tenant_id, status);


--
-- Name: idx_orders_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_tenant ON public.orders USING btree (tenant_id);


--
-- Name: idx_orders_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_tenant_status ON public.orders USING btree (tenant_id, status);


--
-- Name: idx_payment_tenant_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_tenant_store ON public.payment_record USING btree (tenant_id, store_id);


--
-- Name: idx_product_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_tags ON public.product USING gin (tags);


--
-- Name: idx_product_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_tenant ON public.product USING btree (tenant_id);


--
-- Name: idx_product_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_tenant_status ON public.product USING btree (tenant_id, status);


--
-- Name: idx_qr_session_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_session_ticket ON public.sys_qr_session USING btree (ticket, is_verified);


--
-- Name: idx_store_order_last_delivery_tx_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_store_order_last_delivery_tx_uuid ON public.store_order USING btree (last_delivery_tx_uuid) WHERE (last_delivery_tx_uuid IS NOT NULL);


--
-- Name: idx_store_order_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_order_store_id ON public.store_order USING btree (store_id, created_at DESC);


--
-- Name: idx_store_order_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_order_tenant_status ON public.store_order USING btree (tenant_id, order_status, delivery_status);


--
-- Name: idx_store_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_tags ON public.store USING gin (tags);


--
-- Name: idx_store_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_tenant ON public.store USING btree (tenant_id);


--
-- Name: idx_store_tenant_debt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_tenant_debt ON public.store USING btree (tenant_id, current_debt DESC);


--
-- Name: idx_store_tenant_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_tenant_route ON public.store USING btree (tenant_id, route_name);


--
-- Name: idx_unique_tenant_credit_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_tenant_credit_code ON public.platform_tenant USING btree (credit_code) WHERE ((credit_code IS NOT NULL) AND (credit_code <> ''::text));


--
-- Name: driver_collection_log trg_block_delete_driver_collection_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_delete_driver_collection_log BEFORE DELETE ON public.driver_collection_log FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_ledger_delete();


--
-- Name: inventory_log trg_block_delete_inventory_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_delete_inventory_log BEFORE DELETE ON public.inventory_log FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_ledger_delete();


--
-- Name: product trg_block_delete_product; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_delete_product BEFORE DELETE ON public.product FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_ledger_delete();


--
-- Name: store trg_block_delete_store; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_delete_store BEFORE DELETE ON public.store FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_ledger_delete();


--
-- Name: store_order trg_block_delete_store_order; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_delete_store_order BEFORE DELETE ON public.store_order FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_ledger_delete();


--
-- Name: store_order trg_guard_public_order_spam; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_public_order_spam BEFORE INSERT ON public.store_order FOR EACH ROW EXECUTE FUNCTION public.fn_guard_public_order_spam();


--
-- Name: audit_immutable_log trg_immutable_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_immutable_audit_log BEFORE DELETE OR UPDATE ON public.audit_immutable_log FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();


--
-- Name: audit_immutable_log trg_prevent_audit_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_audit_update BEFORE DELETE OR UPDATE ON public.audit_immutable_log FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();


--
-- Name: audit_immutable_log trg_protect_audit_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_audit_log BEFORE DELETE OR UPDATE ON public.audit_immutable_log FOR EACH ROW EXECUTE FUNCTION public.forbid_audit_modification();


--
-- Name: order_item order_item_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_item order_item_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id);


--
-- Name: orders orders_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.store(id);


--
-- Name: payment_record payment_record_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_record
    ADD CONSTRAINT payment_record_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: payment_record payment_record_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_record
    ADD CONSTRAINT payment_record_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.store(id);


--
-- Name: platform_suggestion_board Allow all for platform_suggestion_board; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for platform_suggestion_board" ON public.platform_suggestion_board TO authenticated, anon USING (true);


--
-- Name: audit_immutable_log Allow anon insert audit_immutable_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon insert audit_immutable_log" ON public.audit_immutable_log FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: platform_admin_credential Allow anon read platform_admin_credential; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon read platform_admin_credential" ON public.platform_admin_credential FOR SELECT TO authenticated, anon USING (true);


--
-- Name: platform_tenant Allow anon update platform_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon update platform_tenant" ON public.platform_tenant FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: platform_category Allow full access platform_category; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow full access platform_category" ON public.platform_category TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: platform_suggestion_board Allow full access platform_suggestion_board; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow full access platform_suggestion_board" ON public.platform_suggestion_board TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: tenant_application Allow full access tenant_application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow full access tenant_application" ON public.tenant_application TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: tenant_application Allow public delete tenant_application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete tenant_application" ON public.tenant_application FOR DELETE TO authenticated, anon USING (true);


--
-- Name: platform_tenant Allow public insert platform_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert platform_tenant" ON public.platform_tenant FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: tenant_application Allow public insert tenant_application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert tenant_application" ON public.tenant_application FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: platform_tenant Allow public select platform_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public select platform_tenant" ON public.platform_tenant FOR SELECT TO authenticated, anon USING (true);


--
-- Name: tenant_application Allow public select tenant_application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public select tenant_application" ON public.tenant_application FOR SELECT TO authenticated, anon USING (true);


--
-- Name: tenant_application Allow select tenant_application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow select tenant_application" ON public.tenant_application FOR SELECT TO authenticated, anon USING (true);


--
-- Name: audit_immutable_log allow_all_access_audit_immutable_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_access_audit_immutable_log ON public.audit_immutable_log FOR SELECT USING (true);


--
-- Name: driver_collection_log allow_all_access_driver_collection_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_access_driver_collection_log ON public.driver_collection_log USING (true) WITH CHECK (true);


--
-- Name: inventory_log allow_all_access_inventory_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_access_inventory_log ON public.inventory_log USING (true) WITH CHECK (true);


--
-- Name: platform_category allow_all_access_platform_category; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_access_platform_category ON public.platform_category USING (true) WITH CHECK (true);


--
-- Name: platform_suggestion_board allow_all_access_platform_suggestion_board; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_access_platform_suggestion_board ON public.platform_suggestion_board USING (true) WITH CHECK (true);


--
-- Name: store_lead allow_all_access_store_lead; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_access_store_lead ON public.store_lead USING (true) WITH CHECK (true);


--
-- Name: store_order allow_all_access_store_order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_access_store_order ON public.store_order USING (true) WITH CHECK (true);


--
-- Name: tenant_application allow_all_access_tenant_application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_access_tenant_application ON public.tenant_application USING (true) WITH CHECK (true);


--
-- Name: platform_compliance_case allow_all_compliance_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_compliance_case ON public.platform_compliance_case USING (true) WITH CHECK (true);


--
-- Name: platform_membership_plan allow_all_membership_plan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_membership_plan ON public.platform_membership_plan USING (true) WITH CHECK (true);


--
-- Name: login_qr_session allow_all_qr_session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_qr_session ON public.login_qr_session USING (true) WITH CHECK (true);


--
-- Name: platform_standard_category allow_all_standard_category; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_standard_category ON public.platform_standard_category USING (true) WITH CHECK (true);


--
-- Name: audit_immutable_log allow_audit_insert_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_audit_insert_only ON public.audit_immutable_log FOR INSERT TO anon WITH CHECK (true);


--
-- Name: audit_immutable_log allow_audit_select_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_audit_select_only ON public.audit_immutable_log FOR SELECT TO anon USING (true);


--
-- Name: audit_immutable_log allow_insert_audit_immutable_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_insert_audit_immutable_log ON public.audit_immutable_log FOR INSERT WITH CHECK (true);


--
-- Name: inventory_log allow_insert_inv_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_insert_inv_log ON public.inventory_log FOR INSERT WITH CHECK (true);


--
-- Name: driver_collection_log allow_insert_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_insert_logs ON public.driver_collection_log FOR INSERT WITH CHECK (true);


--
-- Name: store_order allow_insert_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_insert_orders ON public.store_order FOR INSERT WITH CHECK (true);


--
-- Name: platform_category_dict allow_public_all_cat_dict; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_all_cat_dict ON public.platform_category_dict USING (true) WITH CHECK (true);


--
-- Name: demand_forecast_plan allow_public_delete_demand_forecast_plan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_delete_demand_forecast_plan ON public.demand_forecast_plan FOR DELETE USING (true);


--
-- Name: driver_collection_log allow_public_delete_driver_collection_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_delete_driver_collection_log ON public.driver_collection_log FOR DELETE USING (true);


--
-- Name: inventory_log allow_public_delete_inventory_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_delete_inventory_log ON public.inventory_log FOR DELETE USING (true);


--
-- Name: local_inventory_pool allow_public_delete_local_inventory_pool; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_delete_local_inventory_pool ON public.local_inventory_pool FOR DELETE USING (true);


--
-- Name: login_qr_session allow_public_delete_login_qr_session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_delete_login_qr_session ON public.login_qr_session FOR DELETE USING (true);


--
-- Name: platform_category allow_public_delete_platform_category; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_delete_platform_category ON public.platform_category FOR DELETE USING (true);


--
-- Name: platform_suggestion_board allow_public_delete_platform_suggestion_board; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_delete_platform_suggestion_board ON public.platform_suggestion_board FOR DELETE USING (true);


--
-- Name: store_order allow_public_delete_store_order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_delete_store_order ON public.store_order FOR DELETE USING (true);


--
-- Name: tenant_application allow_public_delete_tenant_application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_delete_tenant_application ON public.tenant_application FOR DELETE USING (true);


--
-- Name: audit_immutable_log allow_public_insert_audit_immutable_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_audit_immutable_log ON public.audit_immutable_log FOR INSERT WITH CHECK (true);


--
-- Name: demand_forecast_plan allow_public_insert_demand_forecast_plan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_demand_forecast_plan ON public.demand_forecast_plan FOR INSERT WITH CHECK (true);


--
-- Name: driver_collection_log allow_public_insert_driver_collection_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_driver_collection_log ON public.driver_collection_log FOR INSERT WITH CHECK (true);


--
-- Name: inventory_log allow_public_insert_inventory_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_inventory_log ON public.inventory_log FOR INSERT WITH CHECK (true);


--
-- Name: local_inventory_pool allow_public_insert_local_inventory_pool; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_local_inventory_pool ON public.local_inventory_pool FOR INSERT WITH CHECK (true);


--
-- Name: login_qr_session allow_public_insert_login_qr_session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_login_qr_session ON public.login_qr_session FOR INSERT WITH CHECK (true);


--
-- Name: platform_category allow_public_insert_platform_category; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_platform_category ON public.platform_category FOR INSERT WITH CHECK (true);


--
-- Name: platform_suggestion_board allow_public_insert_platform_suggestion_board; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_platform_suggestion_board ON public.platform_suggestion_board FOR INSERT WITH CHECK (true);


--
-- Name: platform_tenant allow_public_insert_platform_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_platform_tenant ON public.platform_tenant FOR INSERT WITH CHECK (true);


--
-- Name: store_order allow_public_insert_store_order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_store_order ON public.store_order FOR INSERT WITH CHECK (true);


--
-- Name: tenant_application allow_public_insert_tenant_application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_tenant_application ON public.tenant_application FOR INSERT WITH CHECK (true);


--
-- Name: tenant_sub_user allow_public_insert_tenant_sub_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_insert_tenant_sub_user ON public.tenant_sub_user FOR INSERT WITH CHECK (true);


--
-- Name: demand_forecast_plan allow_public_read_demand_forecast_plan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_read_demand_forecast_plan ON public.demand_forecast_plan FOR SELECT USING (true);


--
-- Name: platform_gov_configs allow_public_read_gov_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_read_gov_configs ON public.platform_gov_configs FOR SELECT USING (true);


--
-- Name: local_inventory_pool allow_public_read_local_inventory_pool; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_read_local_inventory_pool ON public.local_inventory_pool FOR SELECT USING (true);


--
-- Name: product allow_public_read_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_read_product ON public.product FOR SELECT USING (true);


--
-- Name: store allow_public_read_store; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_read_store ON public.store FOR SELECT USING (true);


--
-- Name: audit_immutable_log allow_public_select_audit_immutable_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_audit_immutable_log ON public.audit_immutable_log FOR SELECT USING (true);


--
-- Name: demand_forecast_plan allow_public_select_demand_forecast_plan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_demand_forecast_plan ON public.demand_forecast_plan FOR SELECT USING (true);


--
-- Name: driver_collection_log allow_public_select_driver_collection_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_driver_collection_log ON public.driver_collection_log FOR SELECT USING (true);


--
-- Name: inventory_log allow_public_select_inventory_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_inventory_log ON public.inventory_log FOR SELECT USING (true);


--
-- Name: local_inventory_pool allow_public_select_local_inventory_pool; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_local_inventory_pool ON public.local_inventory_pool FOR SELECT USING (true);


--
-- Name: login_qr_session allow_public_select_login_qr_session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_login_qr_session ON public.login_qr_session FOR SELECT USING (true);


--
-- Name: platform_category allow_public_select_platform_category; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_platform_category ON public.platform_category FOR SELECT USING (true);


--
-- Name: platform_suggestion_board allow_public_select_platform_suggestion_board; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_platform_suggestion_board ON public.platform_suggestion_board FOR SELECT USING (true);


--
-- Name: platform_tenant allow_public_select_platform_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_platform_tenant ON public.platform_tenant FOR SELECT USING (true);


--
-- Name: store_order allow_public_select_store_order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_store_order ON public.store_order FOR SELECT USING (true);


--
-- Name: tenant_application allow_public_select_tenant_application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_tenant_application ON public.tenant_application FOR SELECT USING (true);


--
-- Name: tenant_sub_user allow_public_select_tenant_sub_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_tenant_sub_user ON public.tenant_sub_user FOR SELECT USING (true);


--
-- Name: demand_forecast_plan allow_public_update_demand_forecast_plan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_demand_forecast_plan ON public.demand_forecast_plan FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: driver_collection_log allow_public_update_driver_collection_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_driver_collection_log ON public.driver_collection_log FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: inventory_log allow_public_update_inventory_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_inventory_log ON public.inventory_log FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: local_inventory_pool allow_public_update_local_inventory_pool; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_local_inventory_pool ON public.local_inventory_pool FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: login_qr_session allow_public_update_login_qr_session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_login_qr_session ON public.login_qr_session FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: platform_category allow_public_update_platform_category; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_platform_category ON public.platform_category FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: platform_suggestion_board allow_public_update_platform_suggestion_board; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_platform_suggestion_board ON public.platform_suggestion_board FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: platform_tenant allow_public_update_platform_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_platform_tenant ON public.platform_tenant FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: store_order allow_public_update_store_order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_store_order ON public.store_order FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: tenant_application allow_public_update_tenant_application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_tenant_application ON public.tenant_application FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: tenant_sub_user allow_public_update_tenant_sub_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_update_tenant_sub_user ON public.tenant_sub_user FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: platform_gov_configs allow_public_write_gov_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_write_gov_configs ON public.platform_gov_configs USING (true) WITH CHECK (true);


--
-- Name: platform_governance_config allow_read_gov_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_read_gov_config ON public.platform_governance_config FOR SELECT USING (true);


--
-- Name: inventory_log allow_read_inv_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_read_inv_log ON public.inventory_log FOR SELECT USING (true);


--
-- Name: driver_collection_log allow_read_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_read_logs ON public.driver_collection_log FOR SELECT USING (true);


--
-- Name: store_order allow_read_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_read_orders ON public.store_order FOR SELECT USING (true);


--
-- Name: driver_collection_log allow_update_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_update_logs ON public.driver_collection_log FOR UPDATE USING (true);


--
-- Name: store_order allow_update_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_update_orders ON public.store_order FOR UPDATE USING (true);


--
-- Name: platform_tenant allow_update_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_update_tenant ON public.platform_tenant FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: platform_governance_config allow_write_gov_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_write_gov_config ON public.platform_governance_config USING (true) WITH CHECK (true);


--
-- Name: platform_suggestion_board anon_insert_suggestion_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_insert_suggestion_only ON public.platform_suggestion_board FOR INSERT TO authenticated, anon WITH CHECK (((official_reply IS NULL) AND (COALESCE(reply_status, 'pending'::text) = 'pending'::text)));


--
-- Name: audit_immutable_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_immutable_log ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_rate_limit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_rate_limit ENABLE ROW LEVEL SECURITY;

--
-- Name: demand_forecast_plan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.demand_forecast_plan ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_rate_limit deny_all_ratelimit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_ratelimit ON public.auth_rate_limit USING (false) WITH CHECK (false);


--
-- Name: tenant_security_vault deny_all_vault; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_all_vault ON public.tenant_security_vault USING (false) WITH CHECK (false);


--
-- Name: auth_rate_limit deny_anon_all_ratelimit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon_all_ratelimit ON public.auth_rate_limit TO anon USING (false) WITH CHECK (false);


--
-- Name: tenant_security_vault deny_anon_all_vault; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon_all_vault ON public.tenant_security_vault TO anon USING (false) WITH CHECK (false);


--
-- Name: driver; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.driver ENABLE ROW LEVEL SECURITY;

--
-- Name: driver_collection_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.driver_collection_log ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_log ENABLE ROW LEVEL SECURITY;

--
-- Name: local_inventory_pool; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.local_inventory_pool ENABLE ROW LEVEL SECURITY;

--
-- Name: login_qr_session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_qr_session ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_query_guard; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_query_guard ENABLE ROW LEVEL SECURITY;

--
-- Name: order_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_item ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_record; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_record ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admin_credential; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admin_credential ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_category; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_category ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_category_dict; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_category_dict ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_compliance_case; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_compliance_case ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_gov_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_gov_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_governance_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_governance_config ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_membership_plan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_membership_plan ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_standard_category; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_standard_category ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_suggestion_board; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_suggestion_board ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_tenant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_tenant ENABLE ROW LEVEL SECURITY;

--
-- Name: product; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_suggestion_board public_read_suggestion_board; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_suggestion_board ON public.platform_suggestion_board FOR SELECT TO authenticated, anon USING (true);


--
-- Name: store; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store ENABLE ROW LEVEL SECURITY;

--
-- Name: store_lead; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_lead ENABLE ROW LEVEL SECURITY;

--
-- Name: store_order; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_order ENABLE ROW LEVEL SECURITY;

--
-- Name: sys_qr_session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sys_qr_session ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_application; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_application ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_security_vault; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_security_vault ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_sub_user; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_sub_user ENABLE ROW LEVEL SECURITY;

--
-- Name: store_order 允许所有人读写 store_order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "允许所有人读写 store_order" ON public.store_order TO anon USING (true) WITH CHECK (true);


--
-- Name: product 租户商品读取隔离; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "租户商品读取隔离" ON public.product USING ((tenant_id = COALESCE(((current_setting('request.headers'::text, true))::json ->> 'x-tenant-id'::text), 'BJ_HQ'::text)));


--
-- Name: store 租户数据读取隔离; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "租户数据读取隔离" ON public.store USING ((tenant_id = COALESCE(((current_setting('request.headers'::text, true))::json ->> 'x-tenant-id'::text), 'BJ_HQ'::text)));


--
-- Name: tenant 租户查看所属总代信息; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "租户查看所属总代信息" ON public.tenant USING ((id = COALESCE(((current_setting('request.headers'::text, true))::json ->> 'x-tenant-id'::text), 'BJ_HQ'::text)));


--
-- Name: payment_record 租户流水隔离; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "租户流水隔离" ON public.payment_record USING ((tenant_id = COALESCE(((current_setting('request.headers'::text, true))::json ->> 'x-tenant-id'::text), 'BJ_HQ'::text)));


--
-- Name: orders 租户订单操作隔离; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "租户订单操作隔离" ON public.orders USING ((tenant_id = COALESCE(((current_setting('request.headers'::text, true))::json ->> 'x-tenant-id'::text), 'BJ_HQ'::text)));


--
-- Name: order_item 租户订单明细隔离; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "租户订单明细隔离" ON public.order_item USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.tenant_id = COALESCE(((current_setting('request.headers'::text, true))::json ->> 'x-tenant-id'::text), 'BJ_HQ'::text)))));


--
-- PostgreSQL database dump complete
--

\unrestrict hJAH4Mg2aU9tBEau6iGfqtENehxhBXqYnbRi1FEeGtgVL1ij7j8lTekAs3VWVGM

