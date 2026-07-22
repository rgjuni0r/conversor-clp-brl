#!/usr/bin/osascript -l JavaScript

ObjC.import("AppKit");
ObjC.import("CoreImage");

function run(argv) {
  if (argv.length !== 2) {
    throw new Error("Uso: osascript -l JavaScript scripts/generate-qr.js <url> <arquivo.png>");
  }

  const [message, outputPath] = argv;
  const messageData = $(message).dataUsingEncoding($.NSUTF8StringEncoding);
  const filter = $.CIFilter.filterWithName("CIQRCodeGenerator");
  filter.setValueForKey(messageData, "inputMessage");
  filter.setValueForKey($("Q"), "inputCorrectionLevel");

  const outputImage = filter.valueForKey("outputImage");
  if (!outputImage) throw new Error("Não foi possível gerar o QR Code.");

  const canvasSize = 800;
  const margin = 64;
  const qrSize = canvasSize - margin * 2;
  const representation = $.NSCIImageRep.imageRepWithCIImage(outputImage);
  const sourceImage = $.NSImage.alloc.initWithSize(representation.size);
  sourceImage.addRepresentation(representation);

  const finalImage = $.NSImage.alloc.initWithSize($.NSMakeSize(canvasSize, canvasSize));
  finalImage.lockFocus;
  $.NSColor.whiteColor.setFill;
  $.NSRectFill($.NSMakeRect(0, 0, canvasSize, canvasSize));
  $.NSGraphicsContext.currentContext.imageInterpolation = $.NSImageInterpolationNone;
  sourceImage.drawInRectFromRectOperationFraction(
    $.NSMakeRect(margin, margin, qrSize, qrSize),
    $.NSZeroRect,
    $.NSCompositingOperationSourceOver,
    1
  );
  finalImage.unlockFocus;

  const bitmap = $.NSBitmapImageRep.imageRepWithData(finalImage.TIFFRepresentation);
  const png = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
  const standardizedPath = $(outputPath).stringByStandardizingPath;
  const saved = png.writeToFileAtomically(standardizedPath, true);
  if (!saved) throw new Error(`Não foi possível salvar ${outputPath}.`);

  const savedImage = $.CIImage.imageWithContentsOfURL(
    $.NSURL.fileURLWithPath(standardizedPath)
  );
  const detector = $.CIDetector.detectorOfTypeContextOptions(
    $.CIDetectorTypeQRCode,
    undefined,
    $({ CIDetectorAccuracy: $.CIDetectorAccuracyHigh })
  );
  const features = detector.featuresInImage(savedImage);
  const decodedMessage = features.count > 0
    ? ObjC.unwrap(features.objectAtIndex(0).messageString)
    : null;

  if (decodedMessage !== message) {
    throw new Error("O QR Code salvo não passou na validação de leitura.");
  }

  return `QR Code gerado e validado em ${outputPath}`;
}
