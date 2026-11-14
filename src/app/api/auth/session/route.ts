import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/modules/auth/service';
import { getTenantContext } from '@/core/tenancy/context';
import {
  buildSessionPayload,
  createClearSessionCookieHeader,
  createSessionCookieHeader,
  getSessionFromRequest,
} from '@/core/auth/session';

import { ModuleRegistry } from '@/core/registry/module-registry';
import { initializeSystemModules } from '@/modules/init';
import { DEFAULT_COMPANY_SLUG } from '@/core/tenancy/constants';

export async function GET(req: NextRequest) {
  try {
    initializeSystemModules();
    const context = await getTenantContext(req);
    if (!context.companyId) {
      return NextResponse.json(
        { success: false, error: context.error || 'Tenant company could not be resolved.', status: context.status },
        { status: context.status === 'SUSPENDED' || context.status === 'EXPIRED' ? 403 : 400 }
      );
    }

    if (context.status === 'SUSPENDED' || context.status === 'EXPIRED' || context.status === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: context.error || `Tenant status: ${context.status}`, status: context.status },
        { status: 403 }
      );
    }

    // Unauthenticated: Return public company metadata, NEVER default user or user list
    if (!context.isAuthenticated) {
      return NextResponse.json({
        success: true,
        company: {
          id: context.companyId,
          name: context.companyName,
          slug: context.companySlug,
          deploymentMode: context.deploymentMode,
          status: context.status,
        },
        session: null,
        currentUser: null,
        users: [],
        defaultUser: null,
        enabledModules: [],
      });
    }

    // Authenticated: Return session, currentUser, and enabled modules
    const users = await AuthService.getUsersAsync(context.companyId);
    const activeUsers = users.filter((u) => u.is_active === 1);
    const currentUser = activeUsers.find((u) => u.id === context.userId) || {
      id: context.userId,
      username: context.username || '',
      full_name: context.fullName || '',
      role: context.role,
    };

    await ModuleRegistry.loadCompanyModules(context.companyId);
    const enabledModules = ModuleRegistry.getAllEnabledIds(context.companyId);

    return NextResponse.json({
      success: true,
      company: {
        id: context.companyId,
        name: context.companyName,
        slug: context.companySlug,
        deploymentMode: context.deploymentMode,
        status: context.status,
      },
      session: {
        userId: context.userId,
        username: context.username,
        fullName: context.fullName,
        role: context.role,
        companyId: context.companyId,
      },
      currentUser,
      users: activeUsers,
      enabledModules,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getTenantContext(req);
    if (!context.companyId) {
      return NextResponse.json(
        { success: false, message: context.error || 'Tenant company could not be resolved.', status: context.status },
        { status: context.status === 'SUSPENDED' || context.status === 'EXPIRED' ? 403 : 400 }
      );
    }
    if (context.status === 'SUSPENDED' || context.status === 'EXPIRED') {
      return NextResponse.json(
        { success: false, message: `Company workspace is ${context.status.toLowerCase()}. Access denied.`, status: context.status },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { userId, username, password } = body;

    let targetUser: any = null;

    // Case 1: Switching user by userId ONLY allowed if already authenticated as ADMIN in the same company
    // or strictly in pure offline single-user on-premise desktop mode (without tenant subdomain)
    const isPureOnPremise = context.isOnPremise && !context.isCloud && !context.isHostinger && context.companySlug === DEFAULT_COMPANY_SLUG;
    if (userId) {
      if (!isPureOnPremise && (!context.isAuthenticated || context.role !== 'ADMIN')) {
        return NextResponse.json(
          { success: false, message: 'Password authentication required.' },
          { status: 401 }
        );
      }
      targetUser = await AuthService.getUserByIdAsync(userId, context.companyId);
      if (!targetUser || !targetUser.is_active) {
        return NextResponse.json(
          { success: false, message: 'Specified user not found or inactive.' },
          { status: 404 }
        );
      }
    } 
    // Case 2: Standard username + password authentication for this exact tenant
    else if (username && password) {
      const { RateLimiter } = await import('@/core/security/rate-limiter');
      const rateLimitKey = `auth:${context.companyId}:${username.toLowerCase()}`;
      const limit = RateLimiter.checkLimit(rateLimitKey);
      if (!limit.isAllowed) {
        return NextResponse.json(
          { 
            success: false, 
            message: `Too many failed login attempts. Please try again in ${Math.ceil(limit.resetMs / 60000)} minute(s).` 
          },
          { status: 429 }
        );
      }

      targetUser = await AuthService.authenticateAsync(username, password, context.companyId);
      if (!targetUser) {
        RateLimiter.recordFailedAttempt(rateLimitKey);
        return NextResponse.json(
          { success: false, message: 'Invalid username or password for this organization.' },
          { status: 401 }
        );
      }
      RateLimiter.clearAttempts(rateLimitKey);
    } else {
      return NextResponse.json(
        { success: false, message: 'Username and password must be provided.' },
        { status: 400 }
      );
    }

    // Build signed session payload
    const sessionPayload = buildSessionPayload({
      userId: targetUser.id,
      companyId: context.companyId,
      role: targetUser.role,
      username: targetUser.username,
      fullName: targetUser.full_name,
    });

    const res = NextResponse.json({
      success: true,
      message: 'Session created successfully.',
      user: {
        id: targetUser.id,
        username: targetUser.username,
        fullName: targetUser.full_name,
        role: targetUser.role,
      },
      session: {
        userId: targetUser.id,
        username: targetUser.username,
        fullName: targetUser.full_name,
        role: targetUser.role,
        companyId: context.companyId,
      },
    });

    // Set secure HttpOnly cookie on response
    res.headers.set('Set-Cookie', createSessionCookieHeader(sessionPayload));

    return res;
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({
    success: true,
    message: 'Session terminated successfully.',
  });
  res.headers.set('Set-Cookie', createClearSessionCookieHeader());
  return res;
}
