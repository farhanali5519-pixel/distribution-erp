import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/modules/auth/service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pin = body.pin || '';

    const { getTenantContext } = await import('@/core/tenancy/context');
    const { RateLimiter } = await import('@/core/security/rate-limiter');
    const tenant = await getTenantContext(req);
    
    const rateLimitKey = `pin:${tenant.companyId}`;
    const limit = RateLimiter.checkLimit(rateLimitKey, 5, 15 * 60 * 1000);
    if (!limit.isAllowed) {
      return NextResponse.json({
        success: false,
        valid: false,
        message: `Too many incorrect PIN attempts. Please wait ${Math.ceil(limit.resetMs / 60000)} minute(s).`,
      }, { status: 429 });
    }

    const valid = AuthService.verifyAdminPin(pin, tenant.companyId);
    if (!valid) {
      RateLimiter.recordFailedAttempt(rateLimitKey);
    } else {
      RateLimiter.clearAttempts(rateLimitKey);
    }

    return NextResponse.json({
      success: true,
      valid,
      message: valid ? 'PIN verified successfully.' : 'Invalid Admin PIN.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, valid: false, message: error.message }, { status: 400 });
  }
}
