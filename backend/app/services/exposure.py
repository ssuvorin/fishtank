"""Exposure math (T013): safe-eval default_exposure_calc, AED conversion (Principle V)."""
from __future__ import annotations

import ast
import operator as op

from ..models import AED_PEG, Rule

_ALLOWED_BINOPS = {
    ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul,
    ast.Div: op.truediv, ast.Mod: op.mod, ast.Pow: op.pow,
}
_ALLOWED_FUNCS = {"max": max, "min": min, "abs": abs}


def _eval(node, revenue: float) -> float:
    if isinstance(node, ast.Expression):
        return _eval(node.body, revenue)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError("only numeric constants allowed")
    if isinstance(node, ast.Name):
        if node.id == "annual_revenue":
            return float(revenue)
        raise ValueError(f"unknown name {node.id!r}")
    if isinstance(node, ast.BinOp):
        fn = _ALLOWED_BINOPS.get(type(node.op))
        if fn is None:
            raise ValueError(f"operator {type(node.op).__name__} not allowed")
        return fn(_eval(node.left, revenue), _eval(node.right, revenue))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _eval(node.operand, revenue)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.Call):
        if not (isinstance(node.func, ast.Name) and node.func.id in _ALLOWED_FUNCS):
            raise ValueError("only max/min/abs calls allowed")
        args = [_eval(a, revenue) for a in node.args]
        return float(_ALLOWED_FUNCS[node.func.id](*args))
    raise ValueError(f"expression node {type(node).__name__} not allowed")


def resolve_calc(expr: str, annual_revenue: float) -> float:
    """Safely evaluate '750000' / 'annual_revenue * 0.04' / 'max(..., 500000)'."""
    tree = ast.parse(expr.strip(), mode="eval")
    return max(0.0, _eval(tree, annual_revenue))


def _to_usd(amount: float, currency: str) -> float:
    """Convert a framework figure to USD. AED÷peg; EUR statutory ceilings
    already approximate USD for exposure purposes (documented peg 1.0)."""
    c = (currency or "USD").upper()
    if c == "AED":
        return amount / AED_PEG
    if c == "EUR":
        return amount * 1.0  # EUR≈USD for exposure modeling; basis label discloses
    return amount


def compute_exposure(rule: Rule, noul: float, annual_revenue: float) -> tuple[float, str]:
    """Return (exposure_usd, basis).

    Exposure = modeled_calc(usd) × probability — a precedent-calibrated
    estimate, not the statutory maximum. The ceiling is carried separately
    via statutory_label() for display.
    """
    pf = rule.penalty_framework
    expr = pf.modeled_calc or getattr(pf, "default_exposure_calc", "0") or "0"
    try:
        base = resolve_calc(expr, annual_revenue)
    except (ValueError, SyntaxError, ZeroDivisionError):
        base = 0.0
    usd = _to_usd(base, pf.currency) * float(noul)
    basis = pf.basis or "estimate"
    return round(usd, 2), basis


def statutory_label(rule: Rule) -> str:
    """'Cap: USD 28M' style ceiling label, or '' when none published."""
    cap = rule.penalty_framework.statutory_max_usd
    if cap is None:
        return ""
    if cap >= 1_000_000:
        v = cap / 1_000_000
        s = f"{v:.0f}M" if v == int(v) else f"{v:.1f}M"
    elif cap >= 1_000:
        s = f"{cap / 1_000:.0f}K"
    else:
        s = f"{cap:.0f}"
    return f"Cap: USD {s}"


def usd_to_aed(usd: float) -> float:
    return round(usd * AED_PEG, 2)
