declare module "snarkjs" {
  export namespace groth16 {
    function fullProve(
      input: Record<string, string>,
      wasmFile: string,
      zkeyFile: string
    ): Promise<{
      proof: {
        pi_a: [string, string, string];
        pi_b: [[string, string], [string, string], [string, string]];
        pi_c: [string, string, string];
        protocol: string;
        curve: string;
      };
      publicSignals: string[];
    }>;

    function verify(
      vk: any,
      publicSignals: string[],
      proof: any
    ): Promise<boolean>;
  }
}
