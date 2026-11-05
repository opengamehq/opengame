use std::sync::atomic::{AtomicI32, Ordering};
static POINTS: AtomicI32 = AtomicI32::new(0);
#[no_mangle]
pub extern "C" fn points() -> i32 { POINTS.load(Ordering::Relaxed) }
#[no_mangle]
pub extern "C" fn target_x() -> i32 { 40 + (points() * 97) % 520 }
#[no_mangle]
pub extern "C" fn tap(x: f64, y: f64) {
 let target = target_x() as f64;
 if x >= target && x <= target + 70.0 && y >= 180.0 && y <= 250.0 { POINTS.fetch_add(1, Ordering::Relaxed); }
}
