fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 { return Err("usage: probe APK SIGNER_PEM".into()); }
    let path = std::path::Path::new(&args[1]);
    let pem = std::fs::read_to_string(&args[2])?;
    apk::Apk::sign(path, Some(apk::Signer::new(&pem)?))?;
    let certificates = apk::Apk::verify(path)?;
    if certificates.len() != 1 { return Err("expected one signing certificate".into()); }
    println!("APK v2 signature and content digests verified by Rust apk library.");
    Ok(())
}
